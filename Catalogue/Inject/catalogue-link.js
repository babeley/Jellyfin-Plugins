// Injected into jellyfin-web's index.html by the Catalogue plugin.
//
// Two parts:
// 1. A labeled button (icon + "Catalogue" text, like the other nav links) inserted
//    right after the Jellyfin logo in the header's nav row. React owns that row and
//    wipes any child it didn't render itself on every re-render, so a MutationObserver
//    re-inserts our button whenever it disappears. This is inherently coupled to
//    jellyfin-web's current MUI markup and can break on a jellyfin-web update - if the
//    nav row (or, failing that, the icon-only toolbar) can't be found, we fall back to
//    a floating button instead of showing nothing.
// 2. An in-app overlay with an iframe, toggled by that same button (which turns into a
//    "Fermer" button while open), so the Jellyfin header stays visible above the
//    catalogue instead of navigating away from Jellyfin entirely. Used when "Open in
//    new tab" is off; otherwise we just window.open() it. The overlay also closes
//    itself when the user navigates to another Jellyfin view.
(function () {
    if (window.catalogueLinkPlugin) {
        return;
    }

    var BUTTON_ID = 'catalogueLinkButton';
    var OVERLAY_ID = 'catalogueLinkOverlay';
    var HEADER_SEARCH_ATTEMPTS = 30;
    var HEADER_SEARCH_INTERVAL_MS = 300;

    // Folder/binder glyph - more explicit than a plain list for "Catalogue".
    var ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">'
        + '<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"></path></svg>';
    var CLOSE_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">'
        + '<path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"></path></svg>';

    var ACTIVE_STYLE_ID = 'catalogueLinkActiveStyle';
    var ACTIVE_CLASS = 'catalogueLinkActive';

    window.catalogueLinkPlugin = {
        config: null,
        isOverlayOpen: false,
        headerAttempts: 0,
        headerObserver: null,

        init: function () {
            this.injectActiveStyle();
            this.waitForApiClient();
            this.observeNavigation();
        },

        // Injected once: a high-specificity class for the "open/Fermer" state, so it
        // stays visibly accented regardless of which tier's neutral classes the button
        // otherwise carries (copied nav-link, copied icon-button, or the floating pill).
        injectActiveStyle: function () {
            if (document.getElementById(ACTIVE_STYLE_ID)) {
                return;
            }

            var style = document.createElement('style');
            style.id = ACTIVE_STYLE_ID;
            style.textContent = '#' + BUTTON_ID + '.' + ACTIVE_CLASS + ' {'
                + 'background: #00a4dc !important;'
                + 'color: #fff !important;'
                + 'border-radius: 20px !important;'
                + 'padding: 6px 12px !important;'
                + '}';
            document.head.appendChild(style);
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
                window.catalogueLinkPlugin.tryInsertButton();
            }).catch(function (error) {
                console.error('Catalogue: failed to fetch config', error);
            });
        },

        // --- Locating an insertion point in the header ---

        // Prefers the row of text nav links (Favoris, Films, ...), inserting right
        // after the logo (i.e. as that row's first item). Falls back to the icon-only
        // toolbar (cast/search/avatar) if the nav row can't be identified.
        findInsertionTarget: function () {
            var header = document.querySelector('header.MuiAppBar-root, .MuiAppBar-root');
            if (!header) {
                return null;
            }

            var navLinks = header.querySelectorAll('a[href*="#"]');
            for (var i = 0; i < navLinks.length; i++) {
                var parent = navLinks[i].parentElement;
                if (parent && parent.children.length > 1) {
                    return { container: parent, reference: navLinks[i], insertFirst: true, labeled: true };
                }
            }

            var iconBar = header.querySelector('.MuiStack-root, .MuiToolbar-root');
            var referenceIcon = iconBar ? iconBar.querySelector('.MuiIconButton-root, .MuiButtonBase-root') : null;
            if (iconBar && referenceIcon) {
                return { container: iconBar, reference: referenceIcon, insertFirst: false, labeled: false };
            }

            return null;
        },

        tryInsertButton: function () {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var target = this.findInsertionTarget();
            if (target) {
                this.insertButton(target);
                this.observeHeader();
                return;
            }

            this.headerAttempts++;
            if (this.headerAttempts < HEADER_SEARCH_ATTEMPTS) {
                setTimeout(this.tryInsertButton.bind(this), HEADER_SEARCH_INTERVAL_MS);
            } else {
                console.debug('Catalogue: header not found after retries, using a floating button instead');
                this.renderFloatingButton();
            }
        },

        insertButton: function (target) {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            // Copy a neighboring nav item's live classes so ours matches the current
            // build's MUI/Emotion styling instead of hardcoding class names that change
            // on every jellyfin-web build.
            button.className = target.reference ? target.reference.className : '';
            button.setAttribute('aria-label', 'Catalogue');
            button.dataset.catalogueLabeled = target.labeled ? '1' : '0';

            this.renderButtonContent(button, false);

            button.addEventListener('click', function (e) {
                e.preventDefault();
                window.catalogueLinkPlugin.handleClick();
            });

            if (target.insertFirst) {
                target.container.insertBefore(button, target.container.firstChild);
            } else {
                target.container.insertBefore(button, target.reference || null);
            }
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
                var target = self.findInsertionTarget();
                if (target) {
                    self.insertButton(target);
                }
            });

            this.headerObserver.observe(document.body, { childList: true, subtree: true });
        },

        renderFloatingButton: function () {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var link = document.createElement('button');
            link.id = BUTTON_ID;
            link.type = 'button';
            link.setAttribute('aria-label', 'Catalogue');
            link.dataset.catalogueLabeled = '0';

            link.style.position = 'fixed';
            link.style.right = '20px';
            link.style.top = '20px';
            link.style.zIndex = '2147483000';
            link.style.display = 'inline-flex';
            link.style.alignItems = 'center';
            link.style.justifyContent = 'center';
            link.style.width = '40px';
            link.style.height = '40px';
            link.style.padding = '0';
            link.style.borderRadius = '50%';
            link.style.border = 'none';
            link.style.background = '#00a4dc';
            link.style.color = '#fff';
            link.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.45)';
            link.style.cursor = 'pointer';
            link.style.font = 'inherit';

            this.renderButtonContent(link, false);

            link.addEventListener('click', function (e) {
                e.preventDefault();
                window.catalogueLinkPlugin.handleClick();
            });

            document.body.appendChild(link);
        },

        // Swaps a button's icon/label between the "open" (Catalogue) and "close" (Fermer)
        // states, keeping whatever classes/positioning it already has, and toggles the
        // accented "active" class so the close state stands out.
        renderButtonContent: function (button, isOpenState) {
            var labeled = button.dataset.catalogueLabeled === '1';
            var icon = isOpenState ? CLOSE_ICON_SVG : ICON_SVG;
            var label = isOpenState ? 'Fermer' : 'Catalogue';

            if (labeled) {
                button.innerHTML = icon + '<span style="margin-left:6px;">' + label + '</span>';
            } else {
                button.innerHTML = icon;
                button.title = label;
            }

            button.setAttribute('aria-label', label);
            button.classList.toggle(ACTIVE_CLASS, isOpenState);
        },

        setButtonState: function (isOpenState) {
            var button = document.getElementById(BUTTON_ID);
            if (button) {
                this.renderButtonContent(button, isOpenState);
            }
        },

        // --- Click behavior: separate tab, or in-app overlay toggle ---

        handleClick: function () {
            var config = this.config;
            if (!config) {
                return;
            }

            if (config.OpenInNewTab) {
                window.open(config.Url, '_blank', 'noopener,noreferrer');
                return;
            }

            if (this.isOverlayOpen) {
                this.hideOverlay();
            } else {
                this.showOverlay();
            }
        },

        // --- In-app iframe overlay, kept below the Jellyfin header so it stays visible ---

        getHeaderHeight: function () {
            var candidates = ['header.MuiAppBar-root', '.MuiAppBar-root', '.skinHeader'];
            for (var i = 0; i < candidates.length; i++) {
                var el = document.querySelector(candidates[i]);
                if (el) {
                    var height = el.getBoundingClientRect().height;
                    if (height > 0) {
                        return height;
                    }
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
            // Below MUI's default modal/menu/tooltip z-indices (1300/1400/1500) so
            // Jellyfin's own dropdowns (the "Plus" menu, the avatar menu, ...) still
            // render above the overlay instead of being hidden behind it. Still well
            // above ordinary page content.
            overlay.style.zIndex = '1250';
            overlay.style.display = 'none';

            var iframe = document.createElement('iframe');
            iframe.id = OVERLAY_ID + 'Frame';
            iframe.src = 'about:blank';
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = '0';
            iframe.style.display = 'block';

            overlay.appendChild(iframe);
            document.body.appendChild(overlay);

            window.addEventListener('resize', function () {
                if (window.catalogueLinkPlugin.isOverlayOpen) {
                    overlay.style.top = window.catalogueLinkPlugin.getHeaderHeight() + 'px';
                }
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

            overlay.style.display = 'block';
            this.isOverlayOpen = true;
            this.setButtonState(true);
        },

        hideOverlay: function () {
            var overlay = document.getElementById(OVERLAY_ID);
            if (overlay) {
                overlay.style.display = 'none';
            }
            this.isOverlayOpen = false;
            this.setButtonState(false);
        },

        // --- Close the overlay when the user navigates to another Jellyfin view ---

        observeNavigation: function () {
            var self = this;
            var closeIfOpen = function () {
                if (self.isOverlayOpen) {
                    self.hideOverlay();
                }
            };

            window.addEventListener('popstate', closeIfOpen);
            window.addEventListener('hashchange', closeIfOpen);

            var originalPushState = history.pushState;
            history.pushState = function () {
                var result = originalPushState.apply(history, arguments);
                closeIfOpen();
                return result;
            };

            var originalReplaceState = history.replaceState;
            history.replaceState = function () {
                var result = originalReplaceState.apply(history, arguments);
                closeIfOpen();
                return result;
            };
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
