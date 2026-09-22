import { Project } from "../models/Project.js";
import redisClient from "../config/redis.js";

const CACHE_TTL_SECONDS = 300; // 5 minutes

const normalizeProjectId = (projectId) =>
  projectId ? String(projectId).toString() : null;

const normalizeTimestamp = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

export const isProjectCacheValid = (cachedProject, latestProject) => {
  if (!cachedProject || !latestProject) return false;

  const cachedProjectId = normalizeProjectId(cachedProject.projectId);
  const latestProjectId = normalizeProjectId(latestProject._id);

  if (cachedProjectId !== latestProjectId) {
    return false;
  }

  const cachedActive = Boolean(cachedProject.isActive);
  const latestActive = Boolean(latestProject.isActive);

  if (cachedActive !== latestActive) {
    return false;
  }

  const cachedUpdatedAt = normalizeTimestamp(cachedProject.updatedAt);
  const latestUpdatedAt = normalizeTimestamp(latestProject.updatedAt);

  if (cachedUpdatedAt === null || latestUpdatedAt === null) {
    return true;
  }

  return cachedUpdatedAt === latestUpdatedAt;
};

const buildCacheEntry = (project) => ({
  projectId: normalizeProjectId(project._id),
  isActive: Boolean(project.isActive),
  updatedAt: project.updatedAt ? new Date(project.updatedAt).toISOString() : null,
});

const projectResolver = async (req, res, next) => {
  try {
    // URL: /pk_abc123/api/v1/users
    // segments[1] = "pk_abc123"  ← projectKey
    // segments[2+] = actual mock path
    const segments = req.path.split("/");
    const projectKey = segments[1];

    if (!projectKey || !projectKey.startsWith("pk_")) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing project key in URL",
      });
    }

    // rewrite so downstream sees /api/v1/users not /pk_abc123/api/v1/users
    req.mockPath = "/" + segments.slice(2).join("/");

    const cacheKey = `project:key:${projectKey}`;
    const cached = await redisClient.get(cacheKey);

    // --- MongoDB source of truth ---
    const project = await Project.findOne(
      { projectKey },
      "_id isActive updatedAt"
    ).lean();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    if (!project.isActive) {
      // explicit negative cache invalidation for deactivated projects
      await redisClient.del(cacheKey);
      return res.status(403).json({
        success: false,
        message: "Project is inactive",
      });
    }

    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        const cacheValid = isProjectCacheValid(parsedCache, project);

        if (cacheValid) {
          req.projectId = normalizeProjectId(parsedCache.projectId);
          return next();
        }
      } catch (error) {
        // ignore malformed cache and refresh below
      }
    }

    const cacheEntry = buildCacheEntry(project);
    await redisClient.set(cacheKey, JSON.stringify(cacheEntry), "EX", CACHE_TTL_SECONDS);

    req.projectId = normalizeProjectId(project._id);
    next();
  } catch (error) {
    next(error);
  }
};

export default projectResolver;
