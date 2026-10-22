using Microsoft.AspNetCore.Identity;

namespace FoodBuddy.Api.Services.Auth;

/// <summary>註冊、改密碼時的錯誤訊息改為繁體中文，前端可以直接顯示</summary>
public class ChineseIdentityErrorDescriber : IdentityErrorDescriber
{
    static IdentityError E(string code, string description) => new() { Code = code, Description = description };

    public override IdentityError DefaultError() => E(nameof(DefaultError), "發生錯誤，請稍後再試。");
    public override IdentityError DuplicateEmail(string email) => E(nameof(DuplicateEmail), $"{email} 已經註冊過了，請直接登入。");
    public override IdentityError DuplicateUserName(string userName) => E(nameof(DuplicateUserName), $"{userName} 已經註冊過了，請直接登入。");
    public override IdentityError InvalidEmail(string? email) => E(nameof(InvalidEmail), "Email 格式不正確。");
    public override IdentityError InvalidUserName(string? userName) => E(nameof(InvalidUserName), "Email 格式不正確。");
    public override IdentityError PasswordTooShort(int length) => E(nameof(PasswordTooShort), $"密碼至少要 {length} 個字元。");
    public override IdentityError PasswordRequiresDigit() => E(nameof(PasswordRequiresDigit), "密碼要包含數字。");
    public override IdentityError PasswordRequiresLower() => E(nameof(PasswordRequiresLower), "密碼要包含英文小寫字母。");
    public override IdentityError PasswordRequiresUpper() => E(nameof(PasswordRequiresUpper), "密碼要包含英文大寫字母。");
    public override IdentityError PasswordRequiresNonAlphanumeric() => E(nameof(PasswordRequiresNonAlphanumeric), "密碼要包含符號。");
    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars) => E(nameof(PasswordRequiresUniqueChars), $"密碼至少要有 {uniqueChars} 種不同字元。");
    public override IdentityError PasswordMismatch() => E(nameof(PasswordMismatch), "密碼不正確。");
    public override IdentityError LoginAlreadyAssociated() => E(nameof(LoginAlreadyAssociated), "這個 Google 帳號已經連結到其他 FoodBuddy 帳號。");
    public override IdentityError ConcurrencyFailure() => E(nameof(ConcurrencyFailure), "資料已被其他人修改，請重新整理後再試。");
}
