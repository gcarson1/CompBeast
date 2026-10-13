import Capacitor
import WebKit

/// Stands in front of Capacitor's web view delegates and takes over the few
/// decisions the app makes differently; everything else is handed straight
/// through to Capacitor's own handler, which keeps running the bridge.
///
/// Capacitor sends any link that leaves the app's origin to the Safari *app*,
/// which backgrounds Comp Beast mid-season. Here it opens in an in-app Safari
/// sheet instead, and a `target="_blank"` link to one of our own pages — which
/// Capacitor would also send to Safari — simply opens in place.
///
/// It also reports load success and failure to the controller, which owns
/// the launch cover and the offline screen.
final class NavigationGuard: NSObject, WKNavigationDelegate, WKUIDelegate {
    private let capacitor: WebViewDelegationHandler
    private weak var controller: AppViewController?

    init?(webView: WKWebView, controller: AppViewController) {
        guard let capacitor = webView.navigationDelegate as? WebViewDelegationHandler else { return nil }
        self.capacitor = capacitor
        self.controller = controller
        super.init()
        // Assigned last: WebKit asks which methods a delegate implements when
        // it is set, and `responds(to:)` below needs `capacitor` by then.
        webView.navigationDelegate = self
        webView.uiDelegate = self
    }

    // Every delegate method not written out below — JavaScript alerts and
    // confirms, auth challenges, the content process restarting — is
    // Capacitor's, unchanged.
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || capacitor.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        capacitor.responds(to: aSelector) ? capacitor : super.forwardingTarget(for: aSelector)
    }

    // MARK: - WKNavigationDelegate

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url, let controller, isWeb(url) {
            let opensWindow = navigationAction.targetFrame == nil
            let topLevel = opensWindow || navigationAction.targetFrame?.isMainFrame == true
            if topLevel && !controller.isAppURL(url) {
                decisionHandler(.cancel)
                controller.presentInSafari(url)
                return
            }
            if opensWindow {
                decisionHandler(.cancel)
                webView.load(navigationAction.request)
                return
            }
        }
        capacitor.webView(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        capacitor.webView(webView, didFinish: navigation)
        controller?.pageDidFinishLoading()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        capacitor.webView(webView, didFail: navigation, withError: error)
        controller?.pageDidFail(error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        capacitor.webView(webView, didFailProvisionalNavigation: navigation, withError: error)
        controller?.pageDidFail(error)
    }

    // MARK: - WKUIDelegate

    /// `window.open`: our own pages open in place, anything else in the sheet.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url, let controller, isWeb(url) else {
            return capacitor.webView(
                webView,
                createWebViewWith: configuration,
                for: navigationAction,
                windowFeatures: windowFeatures
            )
        }
        if controller.isAppURL(url) {
            webView.load(navigationAction.request)
        } else {
            controller.presentInSafari(url)
        }
        return nil
    }

    private func isWeb(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased()
        return scheme == "http" || scheme == "https"
    }
}
