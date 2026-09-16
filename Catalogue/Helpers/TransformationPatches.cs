using System.Reflection;
using Jellyfin.Plugin.Catalogue.Model;

namespace Jellyfin.Plugin.Catalogue.Helpers
{
    /// <summary>
    /// Callback methods invoked by IAmParadox27's File Transformation plugin (via reflection)
    /// to patch jellyfin-web's index.html before it is served to the browser.
    /// </summary>
    public static class TransformationPatches
    {
        private const string InjectedMarker = "catalogue-link-inject";

        public static string IndexHtml(PatchRequestPayload payload)
        {
            string contents = payload.Contents ?? string.Empty;

            // The transformation can be re-applied (cache invalidation, multiple registrations
            // across a restart); never inject the script twice into the same document.
            if (contents.Contains(InjectedMarker, StringComparison.Ordinal))
            {
                return contents;
            }

            Stream stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream($"{typeof(Plugin).Namespace}.Inject.catalogue-link.js")!;
            using TextReader reader = new StreamReader(stream);
            string script = reader.ReadToEnd();

            // A plain string replace (rather than Regex.Replace) avoids .NET's $-substitution
            // parsing from misinterpreting any "${...}" template literal inside the script.
            string snippet = $"<script defer id=\"{InjectedMarker}\">{script}</script></body>";

            return contents.Replace("</body>", snippet, StringComparison.Ordinal);
        }
    }
}
