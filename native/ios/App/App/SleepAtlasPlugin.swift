import Capacitor
import ImageIO
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// Photos are selected by the system picker. The app never requests library access.
@objc(SleepAtlasPlugin)
public final class SleepAtlasPlugin: CAPPlugin, CAPBridgedPlugin, PHPickerViewControllerDelegate {
    public let identifier = "SleepAtlasPlugin"
    public let jsName = "SleepAtlas"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickImages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseImport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareBackup", returnType: CAPPluginReturnPromise)
    ]

    private let fileQueue = DispatchQueue(label: "com.bingqchen.sleepatlas.files", qos: .userInitiated)
    private let temporaryRoot = FileManager.default.temporaryDirectory.appendingPathComponent("SleepAtlas", isDirectory: true)
    // Accessed on the main queue, including while provider files are being copied.
    private var pickerCall: CAPPluginCall?
    private var shareCall: CAPPluginCall?

    private struct ImportedImage {
        let url: URL
        let name: String
        let mimeType: String
    }

    public override func load() {
        // Previous-process scratch files are never durable app data. No file dates,
        // library metadata, or broad Photos permission are needed for cleanup.
        fileQueue.async {
            try? FileManager.default.removeItem(at: self.temporaryRoot)
        }
    }

    @objc public func pickImages(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pickerCall == nil, self.shareCall == nil else {
                call.reject("Finish the current photo picker or share sheet first.", "BUSY")
                return
            }
            guard let presenter = self.bridge?.viewController,
                  presenter.presentedViewController == nil else {
                call.reject("The photo picker is not available right now.", "UNAVAILABLE")
                return
            }

            var configuration = PHPickerConfiguration()
            configuration.filter = call.getBool("screenshotsOnly") ?? true ? .screenshots : .images
            configuration.selection = .ordered
            configuration.selectionLimit = max(1, min(20, call.getInt("limit") ?? 20))
            configuration.preferredAssetRepresentationMode = .compatible
            let picker = PHPickerViewController(configuration: configuration)
            picker.delegate = self
            // Full screen gives cancellation a single, reliable delegate path.
            picker.modalPresentationStyle = .fullScreen
            self.pickerCall = call
            presenter.present(picker, animated: true)
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let call = pickerCall else { return }
        guard !results.isEmpty else {
            pickerCall = nil
            call.resolve(["files": [], "sessionId": "", "cancelled": true])
            return
        }

        let sessionID = UUID().uuidString
        let sessionDirectory = importDirectory(sessionID)
        fileQueue.async {
            do {
                try FileManager.default.createDirectory(at: sessionDirectory, withIntermediateDirectories: true)
                self.copyImages(Array(results.prefix(20)), into: sessionDirectory, index: 0, copied: []) { outcome in
                    DispatchQueue.main.async {
                        self.pickerCall = nil
                        switch outcome {
                        case .success(let images):
                            var files: [[String: Any]] = []
                            for image in images {
                                guard let webPath = self.bridge?.portablePath(fromLocalURL: image.url) else {
                                    self.removeTemporaryDirectory(sessionDirectory)
                                    call.reject("Could not make the selected images available to the app.", "IMPORT_FAILED")
                                    return
                                }
                                files.append(["webPath": webPath.absoluteString, "name": image.name, "mimeType": image.mimeType])
                            }
                            call.resolve(["files": files, "sessionId": sessionID, "cancelled": false])
                        case .failure(let error):
                            self.removeTemporaryDirectory(sessionDirectory)
                            call.reject("Could not load the selected images. Try downloading them in Photos first.", "IMPORT_FAILED", error)
                        }
                    }
                }
            } catch {
                self.removeTemporaryDirectory(sessionDirectory)
                DispatchQueue.main.async {
                    self.pickerCall = nil
                    call.reject("Could not prepare the image import.", "IMPORT_FAILED", error)
                }
            }
        }
    }

    /// Load one at a time to limit memory use, and preserve the user's selection order.
    private func copyImages(_ results: [PHPickerResult], into directory: URL, index: Int,
                            copied: [ImportedImage], completion: @escaping (Result<[ImportedImage], Error>) -> Void) {
        guard index < results.count else {
            completion(.success(copied))
            return
        }
        let provider = results[index].itemProvider
        guard provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else {
            completion(.failure(NSError(domain: "SleepAtlas", code: 1, userInfo: [NSLocalizedDescriptionKey: "The selected item is not an image."])))
            return
        }
        provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, error in
            guard let url else {
                completion(.failure(error ?? NSError(domain: "SleepAtlas", code: 2, userInfo: [NSLocalizedDescriptionKey: "The image file is unavailable."])))
                return
            }
            do {
                // NSItemProvider deletes its URL after this callback returns: copying
                // must happen here, before dispatching any further work.
                guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
                      let identifier = CGImageSourceGetType(source),
                      let imageType = UTType(identifier as String) else {
                    throw NSError(domain: "SleepAtlas", code: 3, userInfo: [NSLocalizedDescriptionKey: "The image format could not be read."])
                }
                let imageExtension = imageType.preferredFilenameExtension ?? "img"
                let destination = directory.appendingPathComponent("\(index)-\(UUID().uuidString).\(imageExtension)")
                try FileManager.default.copyItem(at: url, to: destination)
                let suggestedName = provider.suggestedName ?? "image-\(index + 1)"
                let name = URL(fileURLWithPath: suggestedName).deletingPathExtension().lastPathComponent + "." + imageExtension
                let image = ImportedImage(url: destination, name: name, mimeType: imageType.preferredMIMEType ?? "application/octet-stream")
                self.fileQueue.async {
                    self.copyImages(results, into: directory, index: index + 1, copied: copied + [image], completion: completion)
                }
            } catch {
                completion(.failure(error))
            }
        }
    }

    @objc public func releaseImport(_ call: CAPPluginCall) {
        guard let sessionID = call.getString("sessionId"), let uuid = UUID(uuidString: sessionID) else {
            call.reject("A valid import session is required.", "INVALID_SESSION")
            return
        }
        // The caller supplies an opaque UUID, never a file path.
        let directory = importDirectory(uuid.uuidString)
        fileQueue.async {
            do {
                if FileManager.default.fileExists(atPath: directory.path) {
                    try FileManager.default.removeItem(at: directory)
                }
                call.resolve()
            } catch {
                call.reject("Could not clear the temporary import files.", "CLEANUP_FAILED", error)
            }
        }
    }

    @objc public func shareBackup(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let data = json.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data)) != nil else {
            call.reject("A valid JSON backup is required.", "INVALID_BACKUP")
            return
        }
        let requestedName = call.getString("filename") ?? "sleep-atlas-backup.json"
        let baseName = URL(fileURLWithPath: requestedName).deletingPathExtension().lastPathComponent
        let filename = (baseName.isEmpty ? "sleep-atlas-backup" : baseName) + ".json"
        DispatchQueue.main.async {
            guard self.pickerCall == nil, self.shareCall == nil else {
                call.reject("Finish the current photo picker or share sheet first.", "BUSY")
                return
            }
            guard let presenter = self.bridge?.viewController,
                  presenter.presentedViewController == nil else {
                call.reject("The share sheet is not available right now.", "UNAVAILABLE")
                return
            }
            self.shareCall = call
            let directory = self.temporaryRoot.appendingPathComponent("exports", isDirectory: true)
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            let fileURL = directory.appendingPathComponent(filename)
            self.fileQueue.async {
                do {
                    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                    try data.write(to: fileURL, options: .atomic)
                    DispatchQueue.main.async {
                        guard presenter.presentedViewController == nil else {
                            self.shareCall = nil
                            self.removeTemporaryDirectory(directory)
                            call.reject("The share sheet is not available right now.", "UNAVAILABLE")
                            return
                        }
                        let activity = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
                        if let popover = activity.popoverPresentationController {
                            popover.sourceView = presenter.view
                            popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                            popover.permittedArrowDirections = []
                        }
                        activity.completionWithItemsHandler = { _, completed, _, error in
                            DispatchQueue.main.async {
                                self.shareCall = nil
                                self.removeTemporaryDirectory(directory)
                                if let error {
                                    call.reject("The backup could not be shared.", "SHARE_FAILED", error)
                                } else {
                                    call.resolve(["completed": completed])
                                }
                            }
                        }
                        presenter.present(activity, animated: true)
                    }
                } catch {
                    self.removeTemporaryDirectory(directory)
                    DispatchQueue.main.async {
                        self.shareCall = nil
                        call.reject("Could not prepare the backup file.", "SHARE_FAILED", error)
                    }
                }
            }
        }
    }

    private func importDirectory(_ sessionID: String) -> URL {
        temporaryRoot.appendingPathComponent("imports", isDirectory: true).appendingPathComponent(sessionID, isDirectory: true)
    }

    private func removeTemporaryDirectory(_ directory: URL) {
        fileQueue.async { try? FileManager.default.removeItem(at: directory) }
    }
}
