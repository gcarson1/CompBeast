import Capacitor
import Network
import SafariServices
import UIKit
import WebKit

/// The app's one screen: Capacitor's web view showing compbeast.app, plus the
/// parts of the shell that have to be native.
///
/// - a launch cover that holds the launch screen's artwork until the first
///   page has painted, so the app never opens on an empty web view;
/// - a native offline screen with a retry, instead of WebKit's blank failure;
/// - links that leave the site open in an in-app Safari sheet (see
///   NavigationGuard), so the app is one swipe away rather than backgrounded;
/// - swipe-from-the-edge to go back, as in every navigation stack on iOS;
/// - a tap on the status bar scrolls the page to the top.
///
/// capacitor.config.ts explains why the app is a hosted web view;
/// src/lib/native.ts is the web half of everything here.
final class AppViewController: CAPBridgeViewController {
    private var navigationGuard: NavigationGuard?
    private let launchCover = LaunchCoverView()
    private let offlineView = OfflineView()
    private let pathMonitor = NWPathMonitor()
    private var networkAvailable = true
    /// The page that failed, so "Try again" retries it rather than going home.
    private var failedURL: URL?

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeShellPlugin())
        guard let webView else { return }
        webView.allowsBackForwardNavigationGestures = true
        navigationGuard = NavigationGuard(webView: webView, controller: self)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(statusBarTapped),
            name: .capacitorStatusBarTapped,
            object: nil
        )
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        offlineView.onRetry = { [weak self] in self?.retry() }
        offlineView.isHidden = true
        for overlay in [offlineView, launchCover] as [UIView] {
            overlay.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(overlay)
            NSLayoutConstraint.activate([
                overlay.topAnchor.constraint(equalTo: view.topAnchor),
                overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ])
        }
        startMonitoringNetwork()
        // A cold server can take a few seconds to answer; past a moment the
        // cover says it is working rather than looking frozen.
        launchCover.showActivity(after: 1.5)
        // The backstop for a page that is slow to say it has painted: after
        // this the page's own loading state is better than a still logo.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            self?.liftLaunchCover()
        }
    }

    deinit {
        pathMonitor.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Page lifecycle (called by NavigationGuard and NativeShellPlugin)

    /// The web side has rendered (NativeBridge.tsx calls `NativeShell.ready`).
    func pageIsReady() {
        liftLaunchCover()
    }

    func pageDidFinishLoading() {
        // Only a real page counts as recovery: WebKit can finish an empty
        // placeholder document after a failed load.
        guard webView?.url?.scheme?.hasPrefix("http") == true else { return }
        failedURL = nil
        offlineView.isHidden = true
        offlineView.setBusy(false)
        // A beat for the first paint to land under the cover before it fades.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.liftLaunchCover()
        }
    }

    func pageDidFail(_ error: Error) {
        let error = error as NSError
        // Not failures: a navigation superseded by another one, and one this
        // app stopped on purpose (a link handed to the Safari sheet).
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return }
        if error.domain == "WebKitErrorDomain" && error.code == 102 { return }

        failedURL = error.userInfo[NSURLErrorFailingURLErrorKey] as? URL
        let offline = error.domain == NSURLErrorDomain && [
            NSURLErrorNotConnectedToInternet,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorDataNotAllowed,
            NSURLErrorInternationalRoamingOff,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorTimedOut,
        ].contains(error.code)
        offlineView.show(offline ? .offline : .unreachable)
        liftLaunchCover()
    }

    // MARK: - Links that leave the site

    /// Whether a URL belongs inside the web view: the site itself, or a host
    /// `server.allowNavigation` admits (Clerk's sign-in subdomains).
    func isAppURL(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased(), let config = bridge?.config else { return false }
        if host == config.serverURL.host?.lowercased() { return true }
        return config.shouldAllowNavigation(to: host)
    }

    func presentInSafari(_ url: URL) {
        let safari = SFSafariViewController(url: url)
        safari.preferredControlTintColor = .brandGold
        safari.dismissButtonStyle = .done
        var presenter: UIViewController = self
        while let presented = presenter.presentedViewController { presenter = presented }
        presenter.present(safari, animated: true)
    }

    // MARK: - Private

    /// iOS scrolls the topmost scroll view when the status bar is tapped, but
    /// the page scrolls inside its own container (AppScroller.tsx), not the
    /// web view, so the gesture has to be handed to it.
    @objc private func statusBarTapped() {
        let script = """
        (document.getElementById('app-scroller') || document.scrollingElement)
          ?.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        """
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    private func liftLaunchCover() {
        guard launchCover.superview != nil, !launchCover.isLifting else { return }
        launchCover.isLifting = true
        UIView.animate(withDuration: 0.25, animations: { self.launchCover.alpha = 0 }) { _ in
            self.launchCover.removeFromSuperview()
        }
    }

    private func retry() {
        guard let webView else { return }
        offlineView.setBusy(true)
        let current = webView.url.flatMap { $0.scheme?.hasPrefix("http") == true ? $0 : nil }
        if let url = failedURL ?? current ?? bridge?.config.appStartServerURL {
            webView.load(URLRequest(url: url))
        }
    }

    /// Retries by itself the moment the connection comes back, so someone
    /// who walked out of a dead spot is not left staring at "Try again".
    private func startMonitoringNetwork() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                let available = path.status == .satisfied
                let recovered = available && !self.networkAvailable
                self.networkAvailable = available
                if recovered && !self.offlineView.isHidden { self.retry() }
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "app.compbeast.network"))
    }
}
