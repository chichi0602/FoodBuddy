using System.Security.Claims;
using FoodBuddy.Api.Data;
using FoodBuddy.Api.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace FoodBuddy.Api.Controllers;

public record RegisterRequest(string Email, string Password, string? DisplayName);
public record LoginRequest(string Email, string Password);
public record UserInfo(string Id, string Email, string? DisplayName, bool HasPassword, IReadOnlyList<string> Logins);
public record AuthProviders(bool Google);

[ApiController]
[Route("api/auth")]
public class AuthController(
    UserManager<AppUser> users,
    SignInManager<AppUser> signIn,
    IAuthenticationSchemeProvider schemes,
    TimeProvider time,
    ILogger<AuthController> logger) : ControllerBase
{
    const string GoogleScheme = "Google";
    const int MaxDisplayNameLength = 30;

    /// <summary>前端依此決定要不要顯示 Google 登入按鈕</summary>
    [HttpGet("providers")]
    public async Task<AuthProviders> Providers() => new(await schemes.GetSchemeAsync(GoogleScheme) is not null);

    [HttpPost("register")]
    public async Task<ActionResult<UserInfo>> Register(RegisterRequest request)
    {
        var email = request.Email?.Trim() ?? "";
        if (email.Length == 0 || string.IsNullOrEmpty(request.Password))
            return BadRequest(new ApiError("請輸入 Email 和密碼。"));

        var user = new AppUser
        {
            UserName = email,
            Email = email,
            DisplayName = CleanDisplayName(request.DisplayName),
            CreatedAt = time.GetUtcNow(),
        };
        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded) return BadRequest(new ApiError(string.Join(" ", result.Errors.Select(e => e.Description).Distinct())));

        await signIn.SignInAsync(user, isPersistent: true);
        return await ToInfo(user);
    }

    [HttpPost("login")]
    public async Task<ActionResult<UserInfo>> Login(LoginRequest request)
    {
        var user = await users.FindByEmailAsync(request.Email?.Trim() ?? "");
        if (user is null || string.IsNullOrEmpty(request.Password))
            return Unauthorized(new ApiError("Email 或密碼不正確。"));

        var result = await signIn.PasswordSignInAsync(user, request.Password, isPersistent: true, lockoutOnFailure: true);
        if (result.IsLockedOut) return Unauthorized(new ApiError("密碼錯誤太多次，請 15 分鐘後再試。"));
        if (!result.Succeeded)
            return Unauthorized(new ApiError(await users.HasPasswordAsync(user)
                ? "Email 或密碼不正確。"
                : "這個帳號是用 Google 登入的，請按「用 Google 登入」。"));
        return await ToInfo(user);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await signIn.SignOutAsync();
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserInfo>> Me()
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        return await ToInfo(user);
    }

    /// <summary>刪除帳號與伺服器上的所有資料（SyncRecords 透過外鍵一起刪除）</summary>
    [Authorize]
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount()
    {
        var user = await users.GetUserAsync(User);
        if (user is null) return Unauthorized();
        var result = await users.DeleteAsync(user);
        if (!result.Succeeded) return StatusCode(500, new ApiError("刪除帳號失敗，請稍後再試。"));
        await signIn.SignOutAsync();
        logger.LogInformation("Account {UserId} deleted", user.Id);
        return NoContent();
    }

    /// <summary>導到 Google 登入頁；回來時進 GoogleCallback</summary>
    [HttpGet("google")]
    public async Task<IActionResult> Google()
    {
        if (await schemes.GetSchemeAsync(GoogleScheme) is null) return NotFound(new ApiError("沒有啟用 Google 登入。"));
        var props = signIn.ConfigureExternalAuthenticationProperties(GoogleScheme, Url.Action(nameof(GoogleCallback)));
        return Challenge(props, GoogleScheme);
    }

    [HttpGet("google/callback")]
    public async Task<IActionResult> GoogleCallback()
    {
        var info = await signIn.GetExternalLoginInfoAsync();
        if (info is null) return Redirect("/login?error=google");

        // 已經連結過的 Google 帳號直接登入
        var signedIn = await signIn.ExternalLoginSignInAsync(info.LoginProvider, info.ProviderKey, isPersistent: true, bypassTwoFactor: true);
        if (signedIn.Succeeded) return await FinishExternal();
        if (signedIn.IsLockedOut) return Redirect("/login?error=locked");

        var email = info.Principal.FindFirstValue(ClaimTypes.Email);
        if (string.IsNullOrEmpty(email)) return Redirect("/login?error=google-email");

        var user = await users.FindByEmailAsync(email);
        if (user is null)
        {
            user = new AppUser
            {
                UserName = email,
                Email = email,
                EmailConfirmed = true,
                DisplayName = CleanDisplayName(info.Principal.FindFirstValue(ClaimTypes.Name)),
                CreatedAt = time.GetUtcNow(),
            };
            var created = await users.CreateAsync(user);
            if (!created.Succeeded) return Redirect("/login?error=google");
        }
        else if (!user.EmailConfirmed)
        {
            // 這個 Email 先前用密碼註冊、但沒有驗證過信箱；Google 證明了信箱屬於現在登入的人，
            // 移除原本的密碼，避免先用別人的 Email 註冊的人保有登入權
            if (await users.HasPasswordAsync(user)) await users.RemovePasswordAsync(user);
            user.EmailConfirmed = true;
            await users.UpdateAsync(user);
            await users.UpdateSecurityStampAsync(user);
            logger.LogInformation("Account {UserId} claimed by Google login; password removed", user.Id);
        }

        var linked = await users.AddLoginAsync(user, info);
        if (!linked.Succeeded) return Redirect("/login?error=google");
        await signIn.SignInAsync(user, isPersistent: true, info.LoginProvider);
        return await FinishExternal();
    }

    async Task<IActionResult> FinishExternal()
    {
        await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
        return Redirect("/");
    }

    async Task<UserInfo> ToInfo(AppUser user)
    {
        var logins = await users.GetLoginsAsync(user);
        return new UserInfo(user.Id, user.Email ?? "", user.DisplayName, await users.HasPasswordAsync(user),
            logins.Select(l => l.LoginProvider).ToList());
    }

    static string? CleanDisplayName(string? name)
    {
        name = name?.Trim();
        if (string.IsNullOrEmpty(name)) return null;
        return name.Length > MaxDisplayNameLength ? name[..MaxDisplayNameLength] : name;
    }
}
