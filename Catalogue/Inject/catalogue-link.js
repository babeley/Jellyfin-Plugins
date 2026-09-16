// Injected into jellyfin-web's index.html by the Catalogue plugin.
// Appends a floating button to document.body (outside the React root), so it survives
// both the legacy layout and the Jellyfin 12 "Modern" (React/MUI) layout without needing
// to hook into either UI's internal DOM, and without being wiped out by React re-renders.
(function () {
    if (window.catalogueLinkPlugin) {
        return;
    }

    var BUTTON_ID = 'catalogueLinkButton';

    window.catalogueLinkPlugin = {
        init: function () {
            this.waitForApiClient();
        },

        waitForApiClient: function () {
            if (typeof ApiClient !== 'undefined') {
                this.fetchConfigAndRender();
            } else {
                setTimeout(this.waitForApiClient.bind(this), 300);
            }
        },

        fetchConfigAndRender: function () {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

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

                window.catalogueLinkPlugin.renderButton(config);
            }).catch(function (error) {
                console.error('Catalogue: failed to fetch config', error);
            });
        },

        renderButton: function (config) {
            if (document.getElementById(BUTTON_ID)) {
                return;
            }

            var link = document.createElement('a');
            link.id = BUTTON_ID;
            link.href = config.Url;
            link.target = config.OpenInNewTab ? '_blank' : '_self';
            link.rel = 'noopener noreferrer';
            link.title = 'Ouvrir le catalogue';
            link.setAttribute('aria-label', 'Ouvrir le catalogue');

            link.style.position = 'fixed';
            link.style.right = '20px';
            link.style.bottom = '20px';
            link.style.zIndex = '2147483000';
            link.style.width = '52px';
            link.style.height = '52px';
            link.style.borderRadius = '50%';
            link.style.display = 'flex';
            link.style.alignItems = 'center';
            link.style.justifyContent = 'center';
            link.style.background = '#00a4dc';
            link.style.color = '#fff';
            link.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.45)';
            link.style.textDecoration = 'none';
            link.style.fontSize = '26px';
            link.style.lineHeight = '1';

            link.textContent = '📖';

            document.body.appendChild(link);
            console.log('Catalogue: button added');
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
