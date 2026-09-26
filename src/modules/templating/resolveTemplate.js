import { faker } from "@faker-js/faker";

/**
 * Recursively walks a template object and resolves {{faker.*}} tokens.
 * 
 * Examples:
 *   "{{faker.person.fullName}}" → "John Doe"
 *   "{{faker.string.uuid}}" → "a3f2c1d4-..."
 *   "{{faker.internet.email}}" → "john@example.com"
 * 
 * Supports nested objects and arrays.
 */
const resolveTemplate = (template, pathParams = {}) => {
  if (typeof template === "string") {
    return resolveString(template, pathParams);
  }

  if (Array.isArray(template)) {
    return template.map((item) => resolveTemplate(item, pathParams));
  }

  if (template && typeof template === "object") {
    const resolved = {};
    for (const [key, value] of Object.entries(template)) {
      resolved[key] = resolveTemplate(value, pathParams);
    }
    return resolved;
  }

  return template;
};

const resolveString = (str, pathParams = {}) => {
  if (typeof str !== "string") {
    return str;
  }

  // Replace {{faker.*}} tokens
  let result = str.replace(/\{\{faker\.([a-zA-Z.]+)\}\}/g, (match, path) => {
    try {
      const parts = path.split(".");
      let value = faker;

      for (const part of parts) {
        value = value[part];
      }

      if (typeof value === "function") {
        return String(value());
      }

      return String(value ?? match);
    } catch (error) {
      return match; // leave unresolved if faker path is invalid
    }
  });

  // Replace {{params.*}} tokens with path params (e.g. /users/:id → params.id)
  result = result.replace(/\{\{params\.([a-zA-Z0-9_]+)\}\}/g, (match, paramName) => {
    return String(pathParams[paramName] ?? match);
  });

  return result;
};

export default resolveTemplate;
