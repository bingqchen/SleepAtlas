import Foundation
import Vision
import ImageIO

struct TextLine: Codable { let text: String; let confidence: Float; let x: Double; let y: Double; let width: Double; let height: Double }
struct OCRResult: Codable { let lines: [TextLine]; let width: Int; let height: Int }
do {
    guard CommandLine.arguments.count == 2 else { throw NSError(domain: "OCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Expected an image path"] ) }
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = properties[kCGImagePropertyPixelWidth] as? Int,
          let height = properties[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0, width * height <= 40_000_000 else {
        throw NSError(domain: "OCR", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unsupported image or image exceeds 40 megapixels"])
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(url: url).perform([request])
    let lines = (request.results ?? []).compactMap { observation -> TextLine? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let rect = observation.boundingBox
        return TextLine(text: candidate.string, confidence: candidate.confidence, x: rect.minX, y: 1 - rect.maxY, width: rect.width, height: rect.height)
    }.sorted { abs($0.y - $1.y) > 0.012 ? $0.y < $1.y : $0.x < $1.x }
    let data = try JSONEncoder().encode(OCRResult(lines: lines, width: width, height: height))
    print(String(data: data, encoding: .utf8)!)
} catch {
    fputs("\(error.localizedDescription)\n", stderr)
    exit(1)
}
