// Injected into jellyfin-web's index.html by the Catalogue plugin.
//
// v1.3.x kept the button outside the React tree entirely (position:fixed, appended to
// document.body, positioned via getBoundingClientRect() math) after v1.2.1.0's literal
// DOM insertion into the header's nav-link row (Favoris/Films/...) caused React's
// reconciliation to occasionally render a duplicate header. But position:fixed doesn't
// adapt to responsive layout changes: on narrow viewports the nav-link row collapses
// into a hamburger toggle positioned at the far left, and our "leftmost clickable
// element outside the nav row" math picked that up instead of the icon cluster,
// stranding the button on the wrong side of the screen.
//
// v1.4.0.0 goes back to real DOM insertion, but only into the header's ICON cluster
// (search/cast/SyncPlay/avatar), never the nav-link row. Other plugins (jellyfin-
// enhanced's "random item" dice button and "active streams" button) insert into that
// exact same cluster using Jellyfin's own legacy header-button classes
// (paper-icon-button-light / headerButton) and visibly behave correctly at every
// viewport size, including responsively - the nav-link row is the part of the header
// React re-renders on every navigation (to update which link is highlighted), while the
// icon cluster's children don't change with the route, which is presumably why
// inserting into the icon cluster doesn't trigger the same reconciliation bug.
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
    var HEADER_SEARCH_ATTEMPTS = 30;
    var HEADER_SEARCH_INTERVAL_MS = 300;

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
        headerAttempts: 0,
        headerObserver: null,

        init: function () {
            this.injectStyle();
            this.waitForApiClient();
            this.observeNavigation();
        },

        // Injected once: the accented "close" state, which needs to stand out
        // regardless of whichever tier's classes the button otherwise carries.
        injectStyle: function () {
            var style = document.createElement('style');
            style.textContent =
                '#' + BUTTON_ID + '.catalogueLinkActive, #' + BUTTON_ID + '.catalogueLinkActive:hover {'
                + 'background: #00a4dc !important; color: #fff !important;'
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

        // --- Locating the icon cluster (never the nav-link row) ---

        // The avatar's own immediate wrapper is a small box by itself; the icon
        // cluster (search/cast/SyncPlay, and other plugins' own buttons) is that
        // wrapper's previous sibling. Confirmed against real DOM from the field:
        //   <div class="MuiBox-root">[dice][active-streams][SyncPlay][cast][search]</div>
        //   <div class="MuiBox-root">[avatar]</div>
        findIconCluster: function () {
            var headers = document.querySelectorAll('header.MuiAppBar-root, .MuiAppBar-root');
            for (var i = headers.length - 1; i >= 0; i--) {
                var header = headers[i];
                if (header.getBoundingClientRect().height === 0) {
                    continue;
                }

                var avatar = header.querySelector('.MuiAvatar-root');
                if (!avatar) {
                    continue;
                }

                var avatarButton = avatar.closest('button, a, [role="button"]');
                var avatarBox = avatarButton ? avatarButton.parentElement : null;
                if (avatarBox && avatarBox.previousElementSibling) {
                    return avatarBox.previousElementSibling;
                }
            }

            return null;
        },

        tryInsertButton: function () {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var cluster = this.findIconCluster();
            if (cluster) {
                this.insertButton(cluster);
                this.observeHeader();
                return;
            }

            this.headerAttempts++;
            if (this.headerAttempts < HEADER_SEARCH_ATTEMPTS) {
                setTimeout(this.tryInsertButton.bind(this), HEADER_SEARCH_INTERVAL_MS);
            } else {
                console.debug('Catalogue: icon cluster not found after retries, using a floating button instead');
                this.renderFloatingButton();
            }
        },

        insertButton: function (cluster) {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var button = document.createElement('button');
            button.id = BUTTON_ID;
            // Jellyfin's own legacy header-button classes/custom-element, still styled
            // correctly (including responsively) in the Modern layout - the same
            // convention jellyfin-enhanced's header buttons visibly rely on.
            button.setAttribute('is', 'paper-icon-button-light');
            button.className = 'headerButton headerButtonRight paper-icon-button-light';
            button.type = 'button';
            button.title = 'Catalogue';
            button.setAttribute('aria-label', 'Catalogue');
            button.innerHTML = ICON_SVG;

            button.addEventListener('click', function (e) {
                e.preventDefault();
                window.catalogueLinkPlugin.handleClick();
            });

            cluster.appendChild(button);
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
                var cluster = self.findIconCluster();
                if (cluster) {
                    self.insertButton(cluster);
                }
            });

            this.headerObserver.observe(document.body, { childList: true, subtree: true });
        },

        // Last-resort fallback if the icon cluster's markup ever changes enough that
        // findIconCluster() can't locate it: better a working floating button than
        // none at all.
        renderFloatingButton: function () {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var link = document.createElement('button');
            link.id = BUTTON_ID;
            link.type = 'button';
            link.title = 'Catalogue';
            link.setAttribute('aria-label', 'Catalogue');

            link.style.position = 'fixed';
            link.style.right = '20px';
            link.style.top = '20px';
            link.style.zIndex = '2147483000';
            link.style.width = '40px';
            link.style.height = '40px';
            link.style.borderRadius = '50%';
            link.style.border = 'none';
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.style.justifyContent = 'center';
            link.style.background = '#00a4dc';
            link.style.color = '#fff';
            link.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.45)';
            link.style.cursor = 'pointer';
            link.innerHTML = ICON_SVG;

            link.addEventListener('click', function (e) {
                e.preventDefault();
                window.catalogueLinkPlugin.handleClick();
            });

            document.body.appendChild(link);
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
                    // Without this, iframe.src stays on the Jellyfin URL we just broke
                    // out of. showOverlay() only ever (re)loads the catalogue when src
                    // is still 'about:blank', so every subsequent open would just show
                    // this same stuck nested Jellyfin page again instead of the
                    // catalogue - resetting it here is what makes the next open fresh.
                    iframe.src = 'about:blank';
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
