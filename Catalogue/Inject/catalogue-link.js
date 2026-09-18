// Injected into jellyfin-web's index.html by the Catalogue plugin.
//
// v1.2.1.0 inserted the button as a literal DOM child of the header's React-managed
// nav-link row / icon toolbar. That caused React's reconciliation to get confused on
// navigation (an untracked extra child throws off its index/key-based diffing) and
// occasionally rendered a whole duplicate header. This version never touches a
// React-managed container at all: the button is a position:fixed element appended to
// document.body (a sibling of the React root, not a child of anything React owns), and
// its screen position is computed from the avatar button's live bounding box instead of
// being structurally inserted next to it. Slightly less "native" looking, but immune to
// that class of bug - and consistent across every view (including admin pages that don't
// share the library's header layout), which was also requested.
//
// The same button doubles as the overlay's close control: an in-app iframe overlay,
// toggled by clicking it (icon swaps to a close glyph while open), keeps the Jellyfin
// header visible above the catalogue instead of navigating away from Jellyfin entirely.
// Used when "Open in new tab" is off; otherwise we just window.open() it. The overlay
// closes itself when the user navigates to another Jellyfin view.
(function () {
    if (window.catalogueLinkPlugin) {
        return;
    }

    var BUTTON_ID = 'catalogueLinkButton';
    var OVERLAY_ID = 'catalogueLinkOverlay';
    var BUTTON_SIZE = 40;
    var BUTTON_GAP = 8;

    // Card file box / archive box glyph (like the U+1F5C3 card-index-box emoji), more
    // explicit for "Catalogue" than a plain folder.
    var ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" '
        + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
        + '<path d="M4 8h16v12H4z"></path><path d="M2 8 6 4h12l4 4"></path><path d="M10 12h4"></path></svg>';
    var CLOSE_ICON_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">'
        + '<path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"></path></svg>';

    window.catalogueLinkPlugin = {
        config: null,
        isOverlayOpen: false,

        init: function () {
            this.injectStyle();
            this.waitForApiClient();
            this.observeNavigation();
        },

        // Injected once: the button's own look (we no longer copy classes from any
        // Jellyfin element, so we own its styling outright) plus the accented "close"
        // state.
        injectStyle: function () {
            var style = document.createElement('style');
            style.textContent =
                '#' + BUTTON_ID + ' {'
                + 'position: fixed; width: ' + BUTTON_SIZE + 'px; height: ' + BUTTON_SIZE + 'px;'
                + 'border-radius: 50%; border: none; display: flex; align-items: center; justify-content: center;'
                + 'background: transparent; color: rgba(255, 255, 255, 0.85); cursor: pointer;'
                + 'z-index: 1100;'
                + '}'
                + '#' + BUTTON_ID + ':hover { background: rgba(255, 255, 255, 0.1); }'
                + '#' + BUTTON_ID + '.catalogueLinkActive, #' + BUTTON_ID + '.catalogueLinkActive:hover {'
                + 'background: #00a4dc; color: #fff;'
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
                window.catalogueLinkPlugin.renderButton();
                window.catalogueLinkPlugin.watchPosition();
            }).catch(function (error) {
                console.error('Catalogue: failed to fetch config', error);
            });
        },

        // --- Button: created once, outside the React tree, repositioned continuously ---

        renderButton: function () {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.innerHTML = ICON_SVG;
            button.title = 'Catalogue';
            button.setAttribute('aria-label', 'Catalogue');

            button.addEventListener('click', function (e) {
                e.preventDefault();
                window.catalogueLinkPlugin.handleClick();
            });

            document.body.appendChild(button);
            this.positionButton();
        },

        // Targets the avatar specifically via MUI's own Avatar component class
        // (.MuiAvatar-root - stable, semantic, unambiguous) for vertical alignment. If
        // more than one header is present in the DOM (seen during page-transition
        // animations, or possibly stray leftovers), search from the last one backwards
        // and skip any with zero height (hidden).
        findAvatarButton: function () {
            var headers = document.querySelectorAll('header.MuiAppBar-root, .MuiAppBar-root');
            for (var i = headers.length - 1; i >= 0; i--) {
                var header = headers[i];
                if (header.getBoundingClientRect().height === 0) {
                    continue;
                }

                var avatar = header.querySelector('.MuiAvatar-root');
                if (avatar) {
                    var clickable = avatar.closest('button, a, [role="button"]');
                    return clickable || avatar;
                }
            }

            return null;
        },

        // The avatar is not the only thing on the right of the header: search, cast,
        // SyncPlay, and other plugins' own header buttons (jellyfin-enhanced's dice and
        // active-streams icons, seen in the wild) sit immediately next to it with
        // essentially no gap. Positioning a fixed distance left of the avatar alone
        // landed on top of whichever button happened to be adjacent. Instead, find the
        // leftmost edge among every clickable element in the header that isn't part of
        // the Favoris/Films/... nav-link row, and anchor to that - guaranteed clear of
        // the whole icon cluster regardless of how many buttons other plugins add to it.
        findIconClusterLeftEdge: function (header) {
            var navStack = header.querySelector('.MuiStack-root');
            var candidates = header.querySelectorAll('button, a[href], [role="button"]');
            var minLeft = null;

            for (var i = 0; i < candidates.length; i++) {
                var el = candidates[i];
                if (navStack && navStack.contains(el)) {
                    continue;
                }

                var rect = el.getBoundingClientRect();
                if (rect.width === 0) {
                    continue;
                }

                if (minLeft === null || rect.left < minLeft) {
                    minLeft = rect.left;
                }
            }

            return minLeft;
        },

        positionButton: function () {
            var button = document.getElementById(BUTTON_ID);
            if (!button) {
                return;
            }

            var avatar = this.findAvatarButton();
            var header = avatar ? avatar.closest('header.MuiAppBar-root, .MuiAppBar-root') : null;
            var clusterLeft = header ? this.findIconClusterLeftEdge(header) : null;

            if (avatar && clusterLeft !== null) {
                var avatarRect = avatar.getBoundingClientRect();
                button.style.top = (avatarRect.top + (avatarRect.height - BUTTON_SIZE) / 2) + 'px';
                button.style.left = (clusterLeft - BUTTON_SIZE - BUTTON_GAP) + 'px';
            } else {
                // Header not found (yet, or on this view): fixed fallback position.
                button.style.top = '12px';
                button.style.left = (window.innerWidth - BUTTON_SIZE - 16) + 'px';
            }
        },

        watchPosition: function () {
            var self = this;

            window.addEventListener('resize', function () {
                self.positionButton();
            });

            // Re-check periodically rather than via a MutationObserver: we only read
            // positions here (never insert/remove DOM nodes), so there is no risk of
            // interfering with React, but a MutationObserver on the whole header would
            // fire far more often than needed for something this cheap to just poll.
            setInterval(function () {
                self.positionButton();
            }, 1000);
        },

        // Swaps the button between the "open" (Catalogue) and "close" (Fermer) states.
        setButtonState: function (isOpenState) {
            var button = document.getElementById(BUTTON_ID);
            if (!button) {
                return;
            }

            button.innerHTML = isOpenState ? CLOSE_ICON_SVG : ICON_SVG;
            var label = isOpenState ? 'Fermer' : 'Catalogue';
            button.title = label;
            button.setAttribute('aria-label', label);
            button.classList.toggle('catalogueLinkActive', isOpenState);
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

            // If the catalogue page links back into this Jellyfin instance (e.g. a
            // "voir dans Jellyfin" link), clicking it inside the iframe navigates the
            // iframe TO Jellyfin's own origin - loading a second, fully functional
            // Jellyfin instance (its own header included) nested inside our overlay,
            // rather than the top-level page. We can only read contentWindow.location
            // once same-origin (reading it for the catalogue page itself throws, which
            // is expected and ignored), so once that happens we break out: navigate the
            // real top-level page there instead and close the overlay.
            iframe.addEventListener('load', function () {
                var href;
                try {
                    href = iframe.contentWindow.location.href;
                } catch (e) {
                    return; // still on the (cross-origin) catalogue page - expected.
                }

                if (href && href !== 'about:blank' && iframe.contentWindow.location.origin === window.location.origin) {
                    window.catalogueLinkPlugin.hideOverlay();
                    window.location.href = href;
                }
            });

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
