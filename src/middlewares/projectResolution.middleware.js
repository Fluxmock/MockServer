import { Project } from "../models/Project.js";
import { readOrRebuild, runtimeCacheKeys } from "../services/runtimeCache.service.js";

const normalizeProjectId = (projectId) => projectId ? String(projectId) : null;

const isProjectCacheEntry = (value) => Boolean(
  value &&
  typeof value === "object" &&
  typeof value.projectId === "string" &&
  typeof value.isActive === "boolean"
);

const toCacheEntry = (project) => ({
  projectId: normalizeProjectId(project._id),
  isActive: Boolean(project.isActive),
  updatedAt: project.updatedAt ? new Date(project.updatedAt).toISOString() : null,
});

const projectResolver = async (req, res, next) => {
  try {
    const segments = req.path.split("/");
    const projectKey = segments[1];

    if (!projectKey || !projectKey.startsWith("pk_")) {
      return res.status(400).json({ success: false, message: "Invalid or missing project key in URL" });
    }

    req.mockPath = "/" + segments.slice(2).join("/");

    const project = await readOrRebuild({
      cacheKey: runtimeCacheKeys.project(projectKey),
      versionKey: runtimeCacheKeys.projectVersion(projectKey),
      validate: isProjectCacheEntry,
      load: async () => {
        const found = await Project.findOne(
          { projectKey },
          "_id isActive updatedAt"
        ).lean();
        return found ? toCacheEntry(found) : null;
      },
    });

    if (!project) {
      return res.status(404).json({ success: false, message: "Project not found" });
    }

    if (!project.isActive) {
      return res.status(403).json({ success: false, message: "Project is inactive" });
    }

    req.projectId = project.projectId;
    return next();
  } catch (error) {
    return next(error);
  }
};

export default projectResolver;
