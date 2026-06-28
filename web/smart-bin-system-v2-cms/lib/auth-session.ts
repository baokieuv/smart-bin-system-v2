export type AccessTokenPayload = {
  realm_access?: {
    roles?: string[];
  };
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
};

export type CmsAccessRole = "super_admin" | "admin" | "user";

export const CMS_ADMIN_ROLES = new Set(["admin", "super_admin", "user"]);

const base64UrlDecode = (input: string) => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
};

export const decodeJwtPayload = (token: string): AccessTokenPayload | null => {
  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payload)) as AccessTokenPayload;
  } catch {
    return null;
  }
};

export const extractRolesFromAccessToken = (token: string) => {
  const payload = decodeJwtPayload(token);
  const roles = payload?.realm_access?.roles;

  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
};

export const getCmsAccessRole = (roles: string[]): CmsAccessRole | null => {
  if (roles.includes("super_admin")) {
    return "super_admin";
  }

  if (roles.includes("admin")) {
    return "admin";
  }

  return "user";
};

export const hasCmsAdminAccess = (roles: string[]) => getCmsAccessRole(roles) !== null;
