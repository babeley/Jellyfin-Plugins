using System.Reflection;
using System.Runtime.Loader;
using Jellyfin.Plugin.Catalogue.Helpers;
using MediaBrowser.Model.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.Catalogue.Services
{
    /// <summary>
    /// Registers our index.html transformation with IAmParadox27's File Transformation plugin.
    /// Runs as a startup scheduled task rather than from the plugin constructor, because by the
    /// time scheduled tasks run every plugin assembly is guaranteed to already be loaded -
    /// unlike constructor order, which Jellyfin does not guarantee across plugins.
    /// </summary>
    public class StartupService : IScheduledTask
    {
        public string Name => "Catalogue Startup";

        public string Key => "Jellyfin.Plugin.Catalogue.Startup";

        public string Description => "Enregistre le bouton du catalogue auprès du plugin File Transformation.";

        public string Category => "Startup Services";

        private readonly ILogger<StartupService> _logger;

        public StartupService(ILogger<StartupService> logger)
        {
            _logger = logger;
        }

        public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            Assembly? fileTransformationAssembly = AssemblyLoadContext.All
                .SelectMany(x => x.Assemblies)
                .FirstOrDefault(x => x.FullName?.Contains(".FileTransformation") ?? false);

            if (fileTransformationAssembly == null)
            {
                _logger.LogWarning(
                    "Le plugin 'File Transformation' n'est pas installé ou pas encore chargé : " +
                    "le bouton du catalogue ne sera pas injecté. Installez-le depuis " +
                    "Dashboard > Plugins > Catalogue puis redémarrez Jellyfin.");
                return Task.CompletedTask;
            }

            Type? pluginInterfaceType = fileTransformationAssembly.GetType("Jellyfin.Plugin.FileTransformation.PluginInterface");
            if (pluginInterfaceType == null)
            {
                _logger.LogWarning("Impossible de trouver PluginInterface dans l'assembly File Transformation.");
                return Task.CompletedTask;
            }

            MethodInfo? registerMethod = pluginInterfaceType.GetMethod("RegisterTransformation");
            if (registerMethod == null)
            {
                _logger.LogWarning("Impossible de trouver la méthode RegisterTransformation.");
                return Task.CompletedTask;
            }

            JObject payload = new JObject
            {
                { "id", Plugin.Instance.Id.ToString() },
                { "fileNamePattern", "index.html" },
                { "callbackAssembly", GetType().Assembly.FullName },
                { "callbackClass", typeof(TransformationPatches).FullName },
                { "callbackMethod", nameof(TransformationPatches.IndexHtml) }
            };

            registerMethod.Invoke(null, new object?[] { payload });

            _logger.LogInformation("Bouton du catalogue enregistré auprès de File Transformation.");

            return Task.CompletedTask;
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            yield return new TaskTriggerInfo { Type = TaskTriggerInfoType.StartupTrigger };
        }
    }
}
