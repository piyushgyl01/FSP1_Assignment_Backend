// Dependencies
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { body, validationResult } = require("express-validator");
const moment = require("moment");

// Models
const { connectToDB } = require("./db/db.connect");
const User = require("./models/User.js");
const Task = require("./models/Task.js");
const Tag = require("./models/Tag.js");
const Project = require("./models/Project.js");
const Team = require("./models/Team.js");

// App setup
const app = express();
const PORT = process.env.PORT;

app.use(express.json());
app.use(
  cors({
    origin: [
      "https://playground-054-frontend.vercel.app",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);
app.use(cookieParser());

connectToDB();

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

// Auth middleware
function verifyToken(req, res, next) {
  const accessToken = req.cookies.access_token;

  if (!accessToken) {
    return res
      .status(403)
      .json({ message: "You need to sign in before continuing" });
  }

  try {
    const decoded = jwt.verify(accessToken, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res
      .status(403)
      .json({ message: "Invalid token", error: error.message });
  }
}

// Generate JWT tokens
function generateTokens(user) {
  const payload = {
    id: user._id,
    username: user.username || user.email,
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ id: user._id }, REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });

  return { accessToken, refreshToken };
}

// Set auth cookies
function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/auth/refresh-token",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// Clear auth cookies
function clearAuthCookies(res) {
  res.cookie("access_token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 0,
  });

  res.cookie("refresh_token", "", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/auth/refresh-token",
    maxAge: 0,
  });
}

// Register user
app.post("/api/auth/register", async (req, res) => {
  const { username, name, email, password } = req.body;

  if (!username || !name || !email || !password) {
    return res
      .status(400)
      .json({ message: "Please provide all required fields" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (email && !emailRegex.test(email)) {
    return res
      .status(400)
      .json({ message: "Please provide a valid email address" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long" });
  }

  try {
    // Check existing user
    const existingUser = await User.findOne({
      $or: [{ username }, { email: email || null }],
    });

    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.username === username
            ? "Username already exists"
            : "Email already exists",
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = new User({
      username,
      name,
      email: email || null,
      password: hashedPassword,
    });

    await newUser.save();

    const { accessToken, refreshToken } = generateTokens(newUser);
    setAuthCookies(res, accessToken, refreshToken);

    const userResponse = {
      _id: newUser._id,
      username: newUser.username,
      name: newUser.name,
      email: newUser.email,
    };

    res
      .status(201)
      .json({ message: "User registered successfully", user: userResponse });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error registering user", error: error.message });
  }
});

// Login user
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Please provide all required fields" });
  }

  try {
    const user = await User.findOne({
      $or: [{ username }, { email: username }],
    }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    setAuthCookies(res, accessToken, refreshToken);

    const userResponse = {
      _id: user._id,
      username: user.username,
      name: user.name,
      email: user.email,
    };

    res
      .status(200)
      .json({ message: "Logged in successfully", user: userResponse });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error logging in user", error: error.message });
  }
});

// Logout user
app.post("/api/auth/logout", (req, res) => {
  clearAuthCookies(res);
  res.status(200).json({ message: "Logged out successfully" });
});

// Refresh token
app.post("/api/auth/refresh-token", async (req, res) => {
  const refreshToken = req.cookies.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ message: "No refresh token provided" });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const tokens = generateTokens(user);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    res.status(200).json({ message: "Token refreshed successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Invalid refresh token", error: error.message });
  }
});

// Get current user
app.get("/api/auth/user", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// USER ROUTES

// Get users with search
app.get("/api/users", verifyToken, async (req, res) => {
  try {
    const { search, limit = 50 } = req.query;

    const filter = { isActive: true };

    // Search across name, email, username
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("-password -__v")
      .limit(parseInt(limit))
      .sort("name");

    res.json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
    });
  }
});

// Get single user
app.get("/api/users/:id", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -__v");

    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user",
    });
  }
});

// TASK ROUTES

// Get tasks with filters and pagination
app.get("/api/tasks", verifyToken, async (req, res) => {
  try {
    const {
      team,
      owner,
      tags,
      project,
      status,
      priority,
      page = 1,
      limit = 10,
      sort = "-createdAt",
    } = req.query;

    const filter = { isActive: true };

    if (team) filter.team = team;
    if (owner) filter.owners = { $in: [owner] };
    if (project) filter.project = project;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(",");
      filter.tags = { $in: tagArray };
    }

    const tasks = await Task.find(filter)
      .populate("project", "name description")
      .populate("team", "name")
      .populate("owners", "name email")
      .populate("tags", "name color")
      .populate("createdBy", "name email")
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Task.countDocuments(filter);

    res.json({
      success: true,
      count: tasks.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: tasks,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching tasks",
    });
  }
});

// Get single task
app.get("/api/tasks/:id", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate("project", "name description")
      .populate("team", "name description")
      .populate("owners", "name email")
      .populate("tags", "name color")
      .populate("createdBy", "name email");

    if (!task || !task.isActive) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching task",
    });
  }
});

// Task validation rules
const taskValidation = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Task name must be between 1 and 100 characters"),
  body("project").isMongoId().withMessage("Please provide a valid project ID"),
  body("team").isMongoId().withMessage("Please provide a valid team ID"),
  body("owners")
    .isArray({ min: 1 })
    .withMessage("At least one owner is required"),
  body("timeToComplete")
    .isFloat({ min: 0.1 })
    .withMessage("Time to complete must be at least 0.1 days"),
];

// Create task
app.post("/api/tasks", verifyToken, taskValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const taskData = {
      ...req.body,
      createdBy: req.user.id,
    };

    const task = await Task.create(taskData);

    const populatedTask = await Task.findById(task._id)
      .populate("project", "name description")
      .populate("team", "name")
      .populate("owners", "name email")
      .populate("tags", "name color")
      .populate("createdBy", "name email");

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: populatedTask,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating task",
    });
  }
});

// Update task
app.put("/api/tasks/:id", verifyToken, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    let task = await Task.findById(req.params.id);

    if (!task || !task.isActive) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    task = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("project", "name description")
      .populate("team", "name")
      .populate("owners", "name email")
      .populate("tags", "name color")
      .populate("createdBy", "name email");

    res.json({
      success: true,
      message: "Task updated successfully",
      data: task,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating task",
    });
  }
});

// Delete task (soft delete)
app.delete("/api/tasks/:id", verifyToken, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task || !task.isActive) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    await Task.findByIdAndUpdate(req.params.id, { isActive: false });

    res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting task",
    });
  }
});

// TEAM ROUTES

// Get teams
app.get("/api/teams", verifyToken, async (req, res) => {
  try {
    const teams = await Team.find({ isActive: true })
      .populate("members", "name email")
      .sort("name");

    res.json({
      success: true,
      count: teams.length,
      data: teams,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching teams",
    });
  }
});

// Team validation
const teamValidation = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Team name must be between 1 and 50 characters"),
];

// Create team
app.post("/api/teams", verifyToken, teamValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const team = await Team.create(req.body);

    res.status(201).json({
      success: true,
      message: "Team created successfully",
      data: team,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating team",
    });
  }
});

// PROJECT ROUTES

// Get projects
app.get("/api/projects", verifyToken, async (req, res) => {
  try {
    const projects = await Project.find({ isActive: true })
      .populate("team", "name description")
      .sort("-createdAt");

    res.json({
      success: true,
      count: projects.length,
      data: projects,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching projects",
    });
  }
});

// Project validation
const projectValidation = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Project name must be between 1 and 100 characters"),
];

// Create project
app.post("/api/projects", verifyToken, projectValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const project = await Project.create(req.body);

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      data: project,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating project",
    });
  }
});

// TAG ROUTES

// Get tags
app.get("/api/tags", verifyToken, async (req, res) => {
  try {
    const tags = await Tag.find({ isActive: true }).sort("name");

    res.json({
      success: true,
      count: tags.length,
      data: tags,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching tags",
    });
  }
});

// Tag validation
const tagValidation = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage("Tag name must be between 1 and 30 characters"),
  body("color")
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage("Please enter a valid hex color"),
];

// Create tag
app.post("/api/tags", verifyToken, tagValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    // Check duplicate
    const existingTag = await Tag.findOne({
      name: req.body.name.toLowerCase(),
      isActive: true,
    });

    if (existingTag) {
      return res.status(409).json({
        success: false,
        message: "Tag already exists",
        data: existingTag,
      });
    }

    // Random color if not provided
    const colors = [
      "#3b82f6",
      "#ef4444",
      "#10b981",
      "#f59e0b",
      "#8b5cf6",
      "#06b6d4",
      "#84cc16",
      "#f97316",
      "#ec4899",
      "#6366f1",
      "#14b8a6",
      "#eab308",
    ];

    const tagData = {
      name: req.body.name.toLowerCase(),
      color:
        req.body.color || colors[Math.floor(Math.random() * colors.length)],
    };

    const tag = await Tag.create(tagData);

    res.status(201).json({
      success: true,
      message: "Tag created successfully",
      data: tag,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Tag already exists",
      });
    }

    console.error("Error creating tag:", error);
    res.status(500).json({
      success: false,
      message: "Error creating tag",
    });
  }
});

// REPORT ROUTES

// Last week completed tasks
app.get("/api/reports/last-week", verifyToken, async (req, res) => {
  try {
    const oneWeekAgo = moment().subtract(7, "days").startOf("day").toDate();
    const now = moment().endOf("day").toDate();

    const completedTasks = await Task.find({
      status: "Completed",
      completedAt: { $gte: oneWeekAgo, $lte: now },
      isActive: true,
    })
      .populate("project", "name")
      .populate("team", "name")
      .populate("owners", "name");

    // Daily stats
    const dailyStats = {};
    for (let i = 6; i >= 0; i--) {
      const date = moment().subtract(i, "days").format("YYYY-MM-DD");
      dailyStats[date] = 0;
    }

    completedTasks.forEach((task) => {
      const date = moment(task.completedAt).format("YYYY-MM-DD");
      if (dailyStats[date] !== undefined) {
        dailyStats[date]++;
      }
    });

    res.json({
      success: true,
      data: {
        totalCompleted: completedTasks.length,
        dailyStats,
        tasks: completedTasks,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating last week report",
    });
  }
});

// Pending tasks report
app.get("/api/reports/pending", verifyToken, async (req, res) => {
  try {
    const pendingTasks = await Task.find({
      status: { $ne: "Completed" },
      isActive: true,
    })
      .populate("project", "name")
      .populate("team", "name")
      .populate("owners", "name");

    const totalPendingDays = pendingTasks.reduce(
      (sum, task) => sum + task.timeToComplete,
      0
    );

    // Group by status
    const statusStats = {};
    pendingTasks.forEach((task) => {
      if (!statusStats[task.status]) {
        statusStats[task.status] = { count: 0, totalDays: 0 };
      }
      statusStats[task.status].count++;
      statusStats[task.status].totalDays += task.timeToComplete;
    });

    res.json({
      success: true,
      data: {
        totalPendingTasks: pendingTasks.length,
        totalPendingDays,
        statusStats,
        averageDaysPerTask:
          pendingTasks.length > 0 ? totalPendingDays / pendingTasks.length : 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating pending work report",
    });
  }
});

// Closed tasks report with grouping
app.get("/api/reports/closed-tasks", verifyToken, async (req, res) => {
  try {
    const { groupBy = "team" } = req.query;

    const completedTasks = await Task.find({
      status: "Completed",
      isActive: true,
    })
      .populate("project", "name")
      .populate("team", "name")
      .populate("owners", "name");

    let groupedStats = {};

    if (groupBy === "team") {
      completedTasks.forEach((task) => {
        const teamName = task.team?.name || "Unassigned";
        if (!groupedStats[teamName]) {
          groupedStats[teamName] = 0;
        }
        groupedStats[teamName]++;
      });
    } else if (groupBy === "owner") {
      completedTasks.forEach((task) => {
        task.owners.forEach((owner) => {
          const ownerName = owner.name;
          if (!groupedStats[ownerName]) {
            groupedStats[ownerName] = 0;
          }
          groupedStats[ownerName]++;
        });
      });
    } else if (groupBy === "project") {
      completedTasks.forEach((task) => {
        const projectName = task.project?.name || "Unassigned";
        if (!groupedStats[projectName]) {
          groupedStats[projectName] = 0;
        }
        groupedStats[projectName]++;
      });
    }

    res.json({
      success: true,
      data: {
        groupBy,
        totalCompleted: completedTasks.length,
        stats: groupedStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating closed tasks report",
    });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Workasana API is running",
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});