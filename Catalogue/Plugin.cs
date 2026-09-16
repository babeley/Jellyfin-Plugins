using Jellyfin.Plugin.Catalogue.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Catalogue
{
    public class Plugin : BasePlugin<PluginConfiguration>, IHasPluginConfiguration, IHasWebPages
    {
        public override Guid Id => Guid.Parse("8a33dd74-dd06-4b9e-bf5e-ca8769d8c25a");

        public override string Name => "Catalogue";

        public override string Description => "Ajoute un bouton flottant qui ouvre votre catalogue externe.";

        public static Plugin Instance { get; private set; } = null!;

        public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
            : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
        }

        public IEnumerable<PluginPageInfo> GetPages()
        {
            string? prefix = GetType().Namespace;

            yield return new PluginPageInfo
            {
                Name = Name,
                EmbeddedResourcePath = $"{prefix}.Configuration.configPage.html"
            };
        }
    }
}
