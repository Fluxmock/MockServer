import mongoose, { Schema } from "mongoose";

// Read-only mirror of the AppServer Project model.
// MockServer never writes to this collection — AppServer owns it.
// Both servers connect to the same MongoDB cluster so this maps
// to the exact same "projects" collection.
const projectSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    projectName: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },
    projectKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  { timestamps: true }
);

export const Project = mongoose.model("Project", projectSchema);
