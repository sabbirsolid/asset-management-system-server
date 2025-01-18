require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Asset Management System is running");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.98vvu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    const userCollection = client.db("assetManagementDB").collection("users");
    const assetCollection = client.db("assetManagementDB").collection("assets");
    const requestCollection = client
      .db("assetManagementDB")
      .collection("requests");
    // jwt api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_ACCESS_TOKEN, {
        expiresIn: "5h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.JWT_ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verifyToken
    const verifyHR = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isHR = user?.role === "HRManager";
      if (!isHR) {
        return res.status(403).send({ message: "forbidden" });
      }
      next();
    };

    app.get("/users/roles/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email: email };

      try {
        const user = await userCollection.findOne(query);

        if (user) {
          const isHR = user.role === "HRManager";
          const isEmployee = user.role === "employee";

          return res.send({ isHR, isEmployee, user });
        }

        res.send({ isHR: false, isEmployee: false, user: null });
      } catch (error) {
        console.error("Error fetching user roles:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    app.get("/assets", async (req, res) => {
      try {
        const {
          search = "",
          sortField = "name",
          sortOrder = "asc",
          stockStatus,
          assetType,
        } = req.query;

        const filter = {};

        // Search by name
        if (search) {
          filter.name = { $regex: search, $options: "i" }; // Case-insensitive search
        }

        // Filter by stock status
        if (stockStatus) {
          filter.quantity =
            stockStatus === "available" ? { $gt: 0 } : { $eq: 0 };
        }

        // Filter by asset type
        if (assetType) {
          filter.type = assetType;
        }

        // Sorting
        const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };

        // Fetch filtered and sorted data
        const result = await assetCollection.find(filter).sort(sort).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching assets:", error);
        res.status(500).send({ error: "Failed to fetch assets" });
      }
    });
    // posting data to database
    app.post("/users", async (req, res) => {
      const query = { email: req.body.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send("User already in the database");
      }
      const result = await userCollection.insertOne(req.body);
      res.send(result);
    });

    app.patch("/assets", verifyToken, verifyHR, async (req, res) => {
      try {
        const filter = { name: req.body.name };
        const options = { upsert: true };
        const existingDoc = await assetCollection.findOne(filter);
        let currentQuantity = parseInt(existingDoc?.quantity || 0);
        if (isNaN(currentQuantity)) {
          return res
            .status(400)
            .send({ error: "Invalid quantity type in database." });
        }
        const newQuantity =
          parseInt(req.body.quantity) + parseInt(currentQuantity);
        if (isNaN(newQuantity)) {
          return res
            .status(400)
            .send({ error: "Quantity must be a valid number." });
        }
        const updateDoc = {
          $set: {
            type: req.body.type,
            quantity: newQuantity,
            addedDate: new Date(),
          },
        };
        const result = await assetCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating asset:", error);
        res.status(500).send({ error: "Failed to update the asset." });
      }
    });

    app.post("/requests", verifyToken, async (req, res) => {
      const { name, requestedQuantity } = req.body;
      const query = { name: name };

      try {
        const asset = await assetCollection.findOne(query);

        if (!asset) {
          return res.status(404).json({ error: "Asset not found" });
        }

        if (asset.quantity < requestedQuantity) {
          return res
            .status(400)
            .json({ error: "Insufficient quantity available" });
        }

        const result = await requestCollection.insertOne(req.body);
        res.send(result);
      } catch (err) {
        res.status(500).json({ error: "Failed to handle the request" });
      }
    });

    // admin faces

    app.get("/allRequests", verifyToken, verifyHR, async (req, res) => {
      try {
        const { search } = req.query;
        const query = {};

        if (search) {
          query.$or = [
            { requesterName: { $regex: search, $options: "i" } },
            { requesterEmail: { $regex: search, $options: "i" } },
          ];
        }

        const result = await requestCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching requests:", error);
        res.status(500).send({ error: "Failed to fetch requests" });
      }
    });

    // Approve a request
    app.patch("/requests/approve/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const updateDoc = {
        $set: {
          status: "approved",
          approvalDate: new Date(),
        },
      };
      const result = await requestCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Reject a request
    app.patch("/requests/reject/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const updateDoc = {
        $set: {
          status: "rejected",
          rejectedDate: new Date(),
        },
      };
      const result = await requestCollection.updateOne(query, updateDoc);
      res.send(result);
    });
    app.patch("/hrProfile/:email", verifyToken, verifyHR, async (req, res) => {
      const query = { email: req.params.email };
      const updateDoc = {
        $set: {
          name: req.body.name
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // employee profile update
    app.patch("/employeeProfile/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };

      const updateDoc = {
        $set: {
          name: req.body.name
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    //all simple requests without filter
    app.get("/requests", verifyToken, async (req, res) => {
      const result = await requestCollection.find().toArray();
      res.send(result);
    });

    app.get("/filteredRequests", async (req, res) => {
      try {
        const { search, requestStatus, assetType } = req.query;
        const query = {};

        if (search) {
          query.name = { $regex: search, $options: "i" };
        }

        if (requestStatus) {
          query.status = requestStatus;
        }

        if (assetType) {
          query.type = assetType;
        }

        const results = await requestCollection.find(query).toArray();

        res.status(200).send(results);
      } catch (error) {
        console.error("Error fetching filtered requests:", error);
        res.status(500).send({ error: "Failed to fetch filtered requests." });
      }
    });

    app.delete("/requests/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await requestCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
