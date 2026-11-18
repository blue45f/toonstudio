export function validateRuntimeDatabaseRole(runtimeDatabaseRole) {
  if (
    typeof runtimeDatabaseRole !== "string" ||
    !/^[a-z_][a-z0-9_]{0,62}$/u.test(runtimeDatabaseRole)
  ) {
    throw new Error(
      "Runtime database role must be an explicit lowercase PostgreSQL role name",
    );
  }
  return runtimeDatabaseRole;
}
