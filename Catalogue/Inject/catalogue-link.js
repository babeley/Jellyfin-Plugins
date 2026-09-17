// Injected into jellyfin-web's index.html by the Catalogue plugin.
//
// Two parts:
// 1. A button inserted into the Modern (React/MUI) header's icon bar, next to the
//    cast/search/avatar icons. React owns that bar and wipes any child it didn't
//    render itself on every re-render, so a MutationObserver re-inserts our button
//    whenever it disappears. This is inherently coupled to jellyfin-web's current MUI
//    markup and can break on a jellyfin-web update - if the header toolbar can't be
//    found after a few seconds, we fall back to a floating button (top-right) instead
//    of showing nothing.
// 2. An in-app overlay with an iframe, toggled by that button, so the Jellyfin header
//    stays visible above the catalogue instead of navigating away from Jellyfin
//    entirely. Used when "Open in new tab" is off; otherwise we just window.open() it.
(function () {
    if (window.catalogueLinkPlugin) {
        return;
    }

    var BUTTON_ID = 'catalogueLinkButton';
    var OVERLAY_ID = 'catalogueLinkOverlay';
    var HEADER_ICON_SELECTORS = [
        'header.MuiAppBar-root .MuiStack-root',
        '.MuiAppBar-root .MuiStack-root',
        'header.MuiAppBar-root .MuiToolbar-root',
        '.MuiAppBar-root .MuiToolbar-root'
    ];
    var HEADER_SEARCH_ATTEMPTS = 30;
    var HEADER_SEARCH_INTERVAL_MS = 300;

    window.catalogueLinkPlugin = {
        config: null,
        headerAttempts: 0,
        headerObserver: null,

        init: function () {
            this.waitForApiClient();
        },

        waitForApiClient: function () {
            if (typeof ApiClient !== 'undefined') {
                this.fetchConfig();
            } else {
                setTimeout(this.waitForApiClient.bind(this), 300);
            }
        },

        fetchConfig: function () {
            ApiClient.fetch({
                url: ApiClient.getUrl('Catalogue/Config'),
                type: 'GET',
                dataType: 'json',
                headers: {
                    accept: 'application/json'
                }
            }).then(function (config) {
                if (!config || !config.Url) {
                    console.debug('Catalogue: no URL configured, skipping button');
                    return;
                }

                window.catalogueLinkPlugin.config = config;
                window.catalogueLinkPlugin.createOverlay();
                window.catalogueLinkPlugin.tryInsertHeaderButton();
            }).catch(function (error) {
                console.error('Catalogue: failed to fetch config', error);
            });
        },

        // --- Header icon button, with a floating fallback if the header markup isn't found ---

        findHeaderIconBar: function () {
            for (var i = 0; i < HEADER_ICON_SELECTORS.length; i++) {
                var candidate = document.querySelector(HEADER_ICON_SELECTORS[i]);
                if (candidate && candidate.querySelector('.MuiIconButton-root, .MuiButtonBase-root')) {
                    return candidate;
                }
            }
            return null;
        },

        tryInsertHeaderButton: function () {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var iconBar = this.findHeaderIconBar();
            if (iconBar) {
                this.insertHeaderButton(iconBar);
                this.observeHeader();
                return;
            }

            this.headerAttempts++;
            if (this.headerAttempts < HEADER_SEARCH_ATTEMPTS) {
                setTimeout(this.tryInsertHeaderButton.bind(this), HEADER_SEARCH_INTERVAL_MS);
            } else {
                console.debug('Catalogue: header icon bar not found after retries, using a floating button instead');
                this.renderFloatingButton();
            }
        },

        insertHeaderButton: function (iconBar) {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var referenceIcon = iconBar.querySelector('.MuiIconButton-root, .MuiButtonBase-root');

            var button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            // Copy a neighboring icon button's live classes so ours matches the current
            // build's MUI/Emotion styling instead of hardcoding class names that change
            // on every jellyfin-web build.
            button.className = referenceIcon ? referenceIcon.className : '';
            button.setAttribute('aria-label', 'Ouvrir le catalogue');
            button.title = 'Ouvrir le catalogue';
            button.style.fontSize = '20px';
            button.style.lineHeight = '1';
            button.textContent = '📖';

            button.addEventListener('click', function (e) {
                e.preventDefault();
                window.catalogueLinkPlugin.handleClick();
            });

            iconBar.insertBefore(button, referenceIcon || null);
        },

        observeHeader: function () {
            if (this.headerObserver) {
                return;
            }

            var self = this;
            this.headerObserver = new MutationObserver(function () {
                if (document.getElementById(BUTTON_ID)) {
                    return;
                }
                var iconBar = self.findHeaderIconBar();
                if (iconBar) {
                    self.insertHeaderButton(iconBar);
                }
            });

            this.headerObserver.observe(document.body, { childList: true, subtree: true });
        },

        renderFloatingButton: function () {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var link = document.createElement('a');
            link.id = BUTTON_ID;
            link.href = '#';
            link.title = 'Ouvrir le catalogue';
            link.setAttribute('aria-label', 'Ouvrir le catalogue');

            link.style.position = 'fixed';
            link.style.right = '20px';
            link.style.top = '20px';
            link.style.zIndex = '2147483000';
            link.style.width = '44px';
            link.style.height = '44px';
            link.style.borderRadius = '50%';
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.style.justifyContent = 'center';
            link.style.background = '#00a4dc';
            link.style.color = '#fff';
            link.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.45)';
            link.style.textDecoration = 'none';
            link.style.fontSize = '22px';
            link.style.lineHeight = '1';
            link.textContent = '📖';

            link.addEventListener('click', function (e) {
                e.preventDefault();
                window.catalogueLinkPlugin.handleClick();
            });

            document.body.appendChild(link);
        },

        // --- Click behavior: separate tab, or in-app overlay ---

        handleClick: function () {
            var config = this.config;
            if (!config) {
                return;
            }

            if (config.OpenInNewTab) {
                window.open(config.Url, '_blank', 'noopener,noreferrer');
            } else {
                this.showOverlay();
            }
        },

        // --- In-app iframe overlay, kept below the Jellyfin header so it stays visible ---

        getHeaderHeight: function () {
            var header = document.querySelector('header.MuiAppBar-root, .MuiAppBar-root, .skinHeader');
            if (header) {
                var height = header.getBoundingClientRect().height;
                if (height > 0) {
                    return height;
                }
            }
            return 64;
        },

        createOverlay: function () {
            if (document.getElementById(OVERLAY_ID)) {
                return;
            }

            var overlay = document.createElement('div');
            overlay.id = OVERLAY_ID;
            overlay.style.position = 'fixed';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.bottom = '0';
            overlay.style.top = this.getHeaderHeight() + 'px';
            overlay.style.background = '#101010';
            overlay.style.zIndex = '2147482999';
            overlay.style.display = 'none';
            overlay.style.flexDirection = 'column';

            var bar = document.createElement('div');
            bar.style.display = 'flex';
            bar.style.justifyContent = 'flex-end';
            bar.style.padding = '8px';
            bar.style.background = '#1c1c1c';
            bar.style.flex = '0 0 auto';

            var closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.textContent = 'Fermer ✕';
            closeButton.style.background = '#00a4dc';
            closeButton.style.color = '#fff';
            closeButton.style.border = 'none';
            closeButton.style.borderRadius = '4px';
            closeButton.style.padding = '6px 14px';
            closeButton.style.cursor = 'pointer';
            closeButton.addEventListener('click', function () {
                window.catalogueLinkPlugin.hideOverlay();
            });

            var iframe = document.createElement('iframe');
            iframe.id = OVERLAY_ID + 'Frame';
            iframe.src = 'about:blank';
            iframe.style.flex = '1 1 auto';
            iframe.style.border = '0';
            iframe.style.width = '100%';

            bar.appendChild(closeButton);
            overlay.appendChild(bar);
            overlay.appendChild(iframe);
            document.body.appendChild(overlay);

            window.addEventListener('resize', function () {
                overlay.style.top = window.catalogueLinkPlugin.getHeaderHeight() + 'px';
            });
        },

        showOverlay: function () {
            var overlay = document.getElementById(OVERLAY_ID);
            if (!overlay) {
                return;
            }

            overlay.style.top = this.getHeaderHeight() + 'px';

            var iframe = document.getElementById(OVERLAY_ID + 'Frame');
            if (iframe && iframe.src === 'about:blank') {
                iframe.src = this.config.Url;
            }

            overlay.style.display = 'flex';
        },

        hideOverlay: function () {
            var overlay = document.getElementById(OVERLAY_ID);
            if (overlay) {
                overlay.style.display = 'none';
            }
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            window.catalogueLinkPlugin.init();
        });
    } else {
        window.catalogueLinkPlugin.init();
    }
})();
