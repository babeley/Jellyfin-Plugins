using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Catalogue.Configuration
{
    public class PluginConfiguration : BasePluginConfiguration
    {
        /// <summary>
        /// Gets or sets the full URL of the catalogue page, including any access token.
        /// </summary>
        public string CatalogueUrl { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets a value indicating whether the catalogue should open in a new browser tab.
        /// When false, it replaces the current Jellyfin tab.
        /// </summary>
        public bool OpenInNewTab { get; set; } = true;
    }
}
