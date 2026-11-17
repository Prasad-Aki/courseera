// app.js
//
// CodeCraftHub REST API
//
// Install dependencies:
// npm install
//
// Start the server:
// npm start
//
// Server URL:
// http://localhost:5000
//

const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = 5000;

// Location of the JSON data file.
const DATA_FILE = path.join(__dirname, "courses.json");

// Express middleware that allows the API to read JSON request bodies.
app.use(express.json());

const ALLOWED_STATUSES = [
    "Not Started",
    "In Progress",
    "Completed"
];

/*
  Create courses.json automatically if it does not exist.
*/
async function ensureDataFileExists() {
    try {
        await fs.access(DATA_FILE);
    } catch (error) {
        if (error.code === "ENOENT") {
            await fs.writeFile(DATA_FILE, "[]", "utf8");
        } else {
            throw new Error(
                `Unable to access courses.json: ${error.message}`
            );
        }
    }
}

/*
  Read courses from courses.json.
*/
async function readCourses() {
    await ensureDataFileExists();

    try {
        const fileContents = await fs.readFile(DATA_FILE, "utf8");
        const courses = JSON.parse(fileContents);

        if (!Array.isArray(courses)) {
            throw new Error("courses.json must contain an array.");
        }

        return courses;
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error("courses.json contains invalid JSON.");
        }

        throw new Error(`Unable to read courses.json: ${error.message}`);
    }
}

/*
  Save courses to courses.json.
*/
async function writeCourses(courses) {
    try {
        await fs.writeFile(
            DATA_FILE,
            JSON.stringify(courses, null, 2),
            "utf8"
        );
    } catch (error) {
        throw new Error(`Unable to write courses.json: ${error.message}`);
    }
}

/*
  Validate a date using the YYYY-MM-DD format.
*/
function isValidDate(dateValue) {
    if (typeof dateValue !== "string") {
        return false;
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(dateValue)) {
        return false;
    }

    const [year, month, day] = dateValue.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

/*
  Validate the fields sent by the client.
*/
function validateCourse(course) {
    const errors = [];

    if (
        typeof course.name !== "string" ||
        course.name.trim() === ""
    ) {
        errors.push("name is required.");
    }

    if (
        typeof course.description !== "string" ||
        course.description.trim() === ""
    ) {
        errors.push("description is required.");
    }

    if (!isValidDate(course.target_date)) {
        errors.push(
            "target_date is required and must use the format YYYY-MM-DD."
        );
    }

    if (
        typeof course.status !== "string" ||
        !ALLOWED_STATUSES.includes(course.status)
    ) {
        errors.push(
            `status must be one of: ${ALLOWED_STATUSES.join(", ")}.`
        );
    }

    return errors;
}

/*
  Convert a URL ID into a valid positive number.
*/
function parseCourseId(value) {
    const id = Number(value);

    if (!Number.isInteger(id) || id < 1) {
        return null;
    }

    return id;
}

/*
  POST /api/courses
  Create a new course.
*/
app.post("/api/courses", async (req, res, next) => {
    try {
        const validationErrors = validateCourse(req.body);

        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: "Validation failed.",
                details: validationErrors
            });
        }

        const courses = await readCourses();

        // Find the highest existing ID.
        // The first course will receive ID 1.
        const highestId = courses.reduce((highest, course) => {
            return course.id > highest ? course.id : highest;
        }, 0);

        const newCourse = {
            id: highestId + 1,
            name: req.body.name.trim(),
            description: req.body.description.trim(),
            target_date: req.body.target_date,
            status: req.body.status,
            created_at: new Date().toISOString()
        };

        courses.push(newCourse);
        await writeCourses(courses);

        res.status(201).json(newCourse);
    } catch (error) {
        next(error);
    }
});

/*
  GET /api/courses
  Get all courses.
*/
app.get("/api/courses", async (req, res, next) => {
    try {
        const courses = await readCourses();

        res.status(200).json(courses);
    } catch (error) {
        next(error);
    }
});

/*
  GET /api/courses/:id
  Get one specific course.
*/
app.get("/api/courses/:id", async (req, res, next) => {
    try {
        const courseId = parseCourseId(req.params.id);
        const courses = await readCourses();

        const course = courses.find((item) => item.id === courseId);

        if (!course) {
            return res.status(404).json({
                error: "Course not found."
            });
        }

        res.status(200).json(course);
    } catch (error) {
        next(error);
    }
});

/*
  PUT /api/courses/:id
  Update an existing course.
*/
app.put("/api/courses/:id", async (req, res, next) => {
    try {
        const courseId = parseCourseId(req.params.id);

        if (courseId === null) {
            return res.status(404).json({
                error: "Course not found."
            });
        }

        const validationErrors = validateCourse(req.body);

        if (validationErrors.length > 0) {
            return res.status(400).json({
                error: "Validation failed.",
                details: validationErrors
            });
        }

        const courses = await readCourses();

        const courseIndex = courses.findIndex(
            (course) => course.id === courseId
        );

        if (courseIndex === -1) {
            return res.status(404).json({
                error: "Course not found."
            });
        }

        // Keep the original ID and creation timestamp.
        const updatedCourse = {
            id: courses[courseIndex].id,
            name: req.body.name.trim(),
            description: req.body.description.trim(),
            target_date: req.body.target_date,
            status: req.body.status,
            created_at: courses[courseIndex].created_at
        };

        courses[courseIndex] = updatedCourse;

        await writeCourses(courses);

        res.status(200).json(updatedCourse);
    } catch (error) {
        next(error);
    }
});

/*
  DELETE /api/courses/:id
  Delete a course.
*/
app.delete("/api/courses/:id", async (req, res, next) => {
    try {
        const courseId = parseCourseId(req.params.id);
        const courses = await readCourses();

        const courseIndex = courses.findIndex(
            (course) => course.id === courseId
        );

        if (courseIndex === -1) {
            return res.status(404).json({
                error: "Course not found."
            });
        }

        const deletedCourse = courses.splice(courseIndex, 1)[0];

        await writeCourses(courses);

        res.status(200).json({
            message: "Course deleted successfully.",
            course: deletedCourse
        });
    } catch (error) {
        next(error);
    }
});

/*
  Handle invalid routes.
*/
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

/*
  Handle invalid JSON request bodies.
*/
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({
            error: "Request body contains invalid JSON."
        });
    }

    console.error(error);

    res.status(500).json({
        error: error.message || "Internal server error."
    });
});

/*
  Create the data file, then start the server.
*/
async function startServer() {
    try {
        await ensureDataFileExists();

        app.listen(PORT, () => {
            console.log(`CodeCraftHub API running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Unable to start server:", error.message);
        process.exit(1);
    }
}

startServer();