import UIKit
import Capacitor

// Главный экран приложения: мост Capacitor и свои плагины
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PrintPlugin())
    }
}

// Печать / PDF чека и накладной: системное окно печати iOS (там же «Сохранить в Файлы»)
@objc(PrintPlugin)
public class PrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PrintPlugin"
    public let jsName = "Printer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printPage", returnType: CAPPluginReturnPromise)
    ]

    @objc func printPage(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Документ"
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("Печать недоступна")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.jobName = title
            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = webView.viewPrintFormatter()
            controller.present(animated: true) { _, completed, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
        }
    }
}
