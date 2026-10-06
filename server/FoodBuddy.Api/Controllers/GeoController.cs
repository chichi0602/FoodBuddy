using FoodBuddy.Api.Models;
using FoodBuddy.Api.Services.Places;
using Microsoft.AspNetCore.Mvc;

namespace FoodBuddy.Api.Controllers;

public record GeocodeRequest(string Name, string? Address, string? City, string? District, string? Country);

[ApiController]
[Route("api/geo")]
public class GeoController(IPlaceSearchService places) : ControllerBase
{
    /// <summary>用地址或店名找店家座標（OpenStreetMap Nominatim）</summary>
    [HttpPost("geocode")]
    public async Task<ActionResult<GeocodeResult>> Geocode(GeocodeRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) && string.IsNullOrWhiteSpace(request.Address))
            return BadRequest(new ApiError("請提供店名或地址。"));
        try
        {
            var result = await places.GeocodePlaceAsync(
                request.Name?.Trim() ?? "", request.Address?.Trim(), request.City, request.District, request.Country, ct);
            return result is null
                ? NotFound(new ApiError("地圖資料裡找不到這個地址或店家，可以改貼 Google Maps 網址。"))
                : result;
        }
        catch (PlaceSearchException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new ApiError(ex.Message));
        }
    }
}
