// models/Task.js
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Task name is required"],
      trim: true,
      maxlength: [100, "Task name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "pg78Project",
      required: [true, "Project is required"],
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "pg78Team",
      required: [true, "Team is required"],
    },
    owners: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "pg78User",
        required: true,
      },
    ],
    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "pg78Tag",
      },
    ],
    timeToComplete: {
      type: Number,
      required: [true, "Time to complete is required"],
      min: [0.1, "Time to complete must be at least 0.1 days"],
    },
    status: {
      type: String,
      enum: ["To Do", "In Progress", "Completed", "Blocked"],
      default: "To Do",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    dueDate: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "pg78User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Update completedAt when status changes to Completed
taskSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    if (this.status === "Completed" && !this.completedAt) {
      this.completedAt = new Date();
    } else if (this.status !== "Completed") {
      this.completedAt = undefined;
    }
  }
  next();
});

// Index for better query performance
taskSchema.index({ project: 1, team: 1, status: 1 });
taskSchema.index({ owners: 1, status: 1 });
taskSchema.index({ tags: 1 });

module.exports = mongoose.model("pg78Task", taskSchema);
