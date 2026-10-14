import UIKit

/// The palette, from tailwind.config.ts.
extension UIColor {
    /// `canvas` — the app's background.
    static let canvas = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
    /// `brand-gold` — the primary action fill.
    static let brandGold = UIColor(red: 245 / 255, green: 158 / 255, blue: 11 / 255, alpha: 1)
    /// `on-gold` — text on a gold fill.
    static let onGold = UIColor(red: 26 / 255, green: 18 / 255, blue: 6 / 255, alpha: 1)
    /// `ink` and `muted` — primary and secondary text on the canvas.
    static let ink = UIColor(red: 248 / 255, green: 250 / 255, blue: 252 / 255, alpha: 1)
    static let muted = UIColor(red: 148 / 255, green: 163 / 255, blue: 184 / 255, alpha: 1)
}

/// The launch screen's artwork, held over the web view until the first page
/// has painted — the launch storyboard draws exactly this, so the hand-over
/// is invisible.
final class LaunchCoverView: UIView {
    var isLifting = false
    private let spinner = UIActivityIndicatorView(style: .medium)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .canvas
        let mark = UIImageView(image: UIImage(named: "BrandMark"))
        mark.translatesAutoresizingMaskIntoConstraints = false
        addSubview(mark)
        spinner.color = .muted
        spinner.hidesWhenStopped = true
        spinner.translatesAutoresizingMaskIntoConstraints = false
        addSubview(spinner)
        NSLayoutConstraint.activate([
            mark.centerXAnchor.constraint(equalTo: centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: centerYAnchor),
            mark.widthAnchor.constraint(equalToConstant: 120),
            mark.heightAnchor.constraint(equalToConstant: 88),
            // Under the mark, where the launch screen has nothing, so its
            // arrival does not move anything the launch screen drew.
            spinner.centerXAnchor.constraint(equalTo: centerXAnchor),
            spinner.topAnchor.constraint(equalTo: mark.bottomAnchor, constant: 48),
        ])
        isAccessibilityElement = true
        accessibilityLabel = "Comp Beast is loading"
    }

    /// Starts the spinner if the cover is still up after `delay` seconds.
    func showActivity(after delay: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.superview != nil, !self.isLifting else { return }
            self.spinner.alpha = 0
            self.spinner.startAnimating()
            UIView.animate(withDuration: 0.3) { self.spinner.alpha = 1 }
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }
}

/// Shown when a page cannot be loaded. Native, because the one moment the
/// web app cannot draw anything is the moment it is needed.
final class OfflineView: UIView {
    enum Reason {
        /// The phone has no connection.
        case offline
        /// The phone is online but the site did not answer.
        case unreachable
    }

    var onRetry: (() -> Void)?

    private let titleLabel = UILabel()
    private let bodyLabel = UILabel()
    private let retryButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .canvas

        let mark = UIImageView(image: UIImage(named: "BrandMark"))
        mark.contentMode = .scaleAspectFit
        mark.isAccessibilityElement = false

        titleLabel.font = UIFontMetrics(forTextStyle: .title1).scaledFont(for: Self.displayFont(size: 30))
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.textColor = .ink
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0
        titleLabel.accessibilityTraits = .header

        bodyLabel.font = UIFont.preferredFont(forTextStyle: .subheadline)
        bodyLabel.adjustsFontForContentSizeCategory = true
        bodyLabel.textColor = .muted
        bodyLabel.textAlignment = .center
        bodyLabel.numberOfLines = 0

        var button = UIButton.Configuration.filled()
        button.baseBackgroundColor = .brandGold
        button.baseForegroundColor = .onGold
        button.cornerStyle = .fixed
        button.background.cornerRadius = 8
        button.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 28, bottom: 13, trailing: 28)
        button.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attributes in
            var attributes = attributes
            attributes.font = UIFont.preferredFont(forTextStyle: .headline)
            return attributes
        }
        button.title = "Try again"
        retryButton.configuration = button
        retryButton.addAction(UIAction { [weak self] _ in self?.onRetry?() }, for: .primaryActionTriggered)

        spinner.color = .muted
        spinner.hidesWhenStopped = true

        let stack = UIStackView(arrangedSubviews: [mark, titleLabel, bodyLabel, retryButton, spinner])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.setCustomSpacing(26, after: mark)
        stack.setCustomSpacing(24, after: bodyLabel)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: 72),
            mark.heightAnchor.constraint(equalToConstant: 53),
            stack.centerYAnchor.constraint(equalTo: safeAreaLayoutGuide.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor, constant: -32),
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            bodyLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 320),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    func show(_ reason: Reason) {
        switch reason {
        case .offline:
            titleLabel.text = "You’re offline"
            bodyLabel.text = "Comp Beast needs a connection to load your leagues. It will reconnect on its own as soon as you’re back online."
        case .unreachable:
            titleLabel.text = "Comp Beast didn’t load"
            bodyLabel.text = "The connection is fine, but the page didn’t answer. Give it a moment and try again."
        }
        setBusy(false)
        isHidden = false
        UIAccessibility.post(notification: .screenChanged, argument: titleLabel)
    }

    func setBusy(_ busy: Bool) {
        retryButton.isEnabled = !busy
        if busy { spinner.startAnimating() } else { spinner.stopAnimating() }
    }

    /// The system face, heavy and condensed — the nearest native voice to the
    /// site's Anton headlines.
    private static func displayFont(size: CGFloat) -> UIFont {
        if #available(iOS 16.0, *) {
            return UIFont.systemFont(ofSize: size, weight: .heavy, width: .condensed)
        }
        return UIFont.systemFont(ofSize: size, weight: .heavy)
    }
}
