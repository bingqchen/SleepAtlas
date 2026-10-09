import Capacitor

final class SleepAtlasViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SleepAtlasPlugin())
    }
}
