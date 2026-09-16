using Jellyfin.Plugin.Catalogue.Model;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Catalogue.Controller
{
    /// <summary>
    /// Serves the catalogue URL/settings to the injected client script. Like every other
    /// Jellyfin API controller, this requires an authenticated request by default.
    /// </summary>
    [ApiController]
    [Route("Catalogue")]
    public class CatalogueController : ControllerBase
    {
        [HttpGet("Config")]
        public ActionResult<CatalogueConfig> GetConfig()
        {
            var configuration = Plugin.Instance.Configuration;

            return Ok(new CatalogueConfig
            {
                Url = configuration.CatalogueUrl,
                OpenInNewTab = configuration.OpenInNewTab
            });
        }
    }
}
