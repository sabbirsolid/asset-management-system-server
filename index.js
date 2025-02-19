require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const moment = require("moment");
const stripe = require("stripe")(process.env.STRIPE_SECURITY_KEY);
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
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
    const userCollection = client.db("assetManagementDB").collection("users");
    const assetCollection = client.db("assetManagementDB").collection("assets");
    const packageCollection = client
      .db("assetManagementDB")
      .collection("packages");
    const requestCollection = client
      .db("assetManagementDB")
      .collection("requests");
    const noticeCollection = client
      .db("assetManagementDB")
      .collection("notices");
    const paymentCollection = client
      .db("assetManagementDB")
      .collection("payments");
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

    // verify admin after verifyToken
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
    const verifyEmployee = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isEmployee = user?.role === "employee";
      if (!isEmployee) {
        return res.status(403).send({ message: "forbidden" });
      }
      next();
    };

    // getting an employee team
    app.get(
      "/usersTeam/:email",
      verifyToken,
      verifyEmployee,
      async (req, res) => {
        const query = { email: req.params.email };
        const userInfo = await userCollection.findOne(query);
        if (userInfo?.hrEmail) {
          const team = await userCollection
            .find({ hrEmail: userInfo.hrEmail })
            .toArray();
          res.send(team);
        } else {
          res.send([]);
        }
      }
    );
    // get all unemployed users
    app.get("/users/:email", verifyToken, async (req, res) => {
      // console.log(req.params.email);
      const unemployedUsers = await userCollection
        .find({ company: null, role: "employee" })
        .toArray();
      const hrInfo = await userCollection.findOne({ email: req.params.email });
      const hrMembers = await userCollection
        .find({ hrEmail: req.params.email })
        .toArray();
      res.send({ unemployedUsers, hrInfo, hrMembers });
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
    // update user limit
    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const newMember = parseInt(req.body.newMember);
      const updateDoc = {
        $inc: { employeeCount: newMember },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // adding employee
    app.patch("/usersAdd", verifyToken, verifyHR, async (req, res) => {
      const { id, hrEmail, company, companyLogo } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          hrEmail: hrEmail,
          company: company,
          companyLogo: companyLogo,
        },
      };
      const employee = await userCollection.updateOne(query, updateDoc);
      res.send(employee);
    });
    // removing employee
    app.patch("/usersRemove/:id", verifyToken, verifyHR, async (req, res) => {
      const id = req.params;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          hrEmail: null,
          company: null,
          companyLogo: null,
        },
      };
      const employee = await userCollection.updateOne(query, updateDoc);
      res.send(employee);
    });

    // getting user roles
    app.get("/users/roles/:email", async (req, res) => {
      const email = req.params.email;
      // console.log(email);
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
        // console.error("Error fetching user roles:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    // testing
    app.get("/assets", verifyToken, async (req, res) => {
      try {
        const {
          search = "",
          sortField = "name",
          sortOrder = "asc",
          stockStatus,
          assetType,
          email,
        } = req.query;
        const userInfo = await userCollection.findOne({ email: email });
        if (userInfo?.hrEmail) {
          const filter = {
            hrEmail: userInfo.hrEmail,
          };
          if (search) {
            filter.name = { $regex: search, $options: "i" };
          }
          if (stockStatus) {
            filter.quantity =
              stockStatus === "available" ? { $gt: 0 } : { $eq: 0 };
          }
          if (assetType) {
            filter.type = assetType;
          }
          const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };
          const result = await assetCollection
            .find(filter)
            .sort(sort)
            .toArray();
          return res.send(result);
        }
        res.send([]);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch assets" });
      }
    });
    // asset for specific hr
    app.get("/assetsHR", verifyToken, verifyHR, async (req, res) => {
      try {
        const {
          search = "",
          sortOrder,
          stockStatus,
          assetType,
          email,
        } = req.query;
        // Find user info based on email
        if (email) {
          const filter = {
            hrEmail: email,
          };

          // Search by name
          if (search) {
            filter.name = { $regex: search, $options: "i" };
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
          const sort = { ["quantity"]: sortOrder === "asc" ? 1 : -1 };

          // Fetch filtered and sorted data
          const result = await assetCollection
            .find(filter)
            .sort(sort)
            .toArray();
          return res.send(result);
        }

        // If no hrEmail match, send an empty response
        res.send([]);
      } catch (error) {
        // console.error("Error fetching assets:", error);
        res.status(500).send({ error: "Failed to fetch assets" });
      }
    });
    // add an asset
    app.patch("/assets", verifyToken, verifyHR, async (req, res) => {
      try {
        // const filter = { name: req.body.name, hrEmail: req.body.hrEmail };
        const filter = {
          name: { $regex: `^${req.body.name}$`, $options: "i" },
          hrEmail: { $regex: `^${req.body.hrEmail}$`, $options: "i" },
        };
        const options = { upsert: true, collation: undefined };
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
            name: req.body.name,
            type: req.body.type,
            quantity: newQuantity,
            addedDate: new Date(),
            hrEmail: req.body.hrEmail,
            company: req.body.company,
          },
        };
        const result = await assetCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update the asset." });
      }
    });

    // decreasing assets quantity
    app.patch("/assetDecrease", verifyToken, verifyHR, async (req, res) => {
      try {
        const { assetId, requestedQuantity } = req.body;

        if (isNaN(requestedQuantity)) {
          return res.status(400).send({ error: "Invalid requestedQuantity" });
        }

        const filter = { _id: new ObjectId(assetId) };
        const asset = await assetCollection.findOne(filter);
        const updateDoc = {
          $set: {
            quantity: parseInt(asset.quantity) - parseInt(requestedQuantity),
          },
        };

        const result = await assetCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        // console.error("Error decreasing asset quantity:", error);
        res.status(500).send({ error: "Failed to decrease asset quantity" });
      }
    });

    // increase assets quantity implementing return function
    app.patch("/assetReturn", verifyToken, async (req, res) => {
      const { assetId, requestedQuantity } = req.body;
      const filter = { _id: new ObjectId(assetId) };
      const asset = await assetCollection.findOne(filter);
      const updateDoc = {
        $set: {
          quantity: parseInt(asset.quantity) + parseInt(requestedQuantity),
        },
      };
      const result = await assetCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // hr: update an asset
    app.patch("/assetUpdate/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;
      const result = await assetCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            name: updatedData.name,
            quantity: updatedData.quantity,
            type: updatedData.type,
          },
        }
      );
      res.send(result);
    });

    // hr: asset delete
    app.delete("/assetDelete/:id", verifyToken, verifyHR, async (req, res) => {
      const result = await assetCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    // getting low stock asset by specific hr
    app.get("/assetLowStock", verifyToken, verifyHR, async (req, res) => {
      try {
        const { email } = req.query;
        const query = {
          hrEmail: email,
          quantity: { $lt: 10 },
        };
        const result = await assetCollection.find(query).limit(10).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Error fetching low stock assets");
      }
    });

    // add multiple users
    app.patch("/multipleUsersAdd", verifyToken, verifyHR, async (req, res) => {
      const { userIds, hrEmail, company, companyLogo } = req.body;
      const updatePromises = userIds?.map((id) =>
        userCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              hrEmail: hrEmail,
              company: company,
              companyLogo: companyLogo,
            },
          },
          { upsert: true }
        )
      );
      const results = await Promise.all(updatePromises);
      res.send(results);
    });

    app.get("/pendingRequestsHR", verifyToken, verifyHR, async (req, res) => {
      try {
        const query = { hrEmail: req.query.email, status: "pending" };

        // Limit the number of pending requests to 5
        const result = await requestCollection.find(query).limit(5).toArray();

        res.send(result);
      } catch (err) {
        res.status(500).send("Server Error");
      }
    });

    //hr:  top most requested items
    app.get("/topRequestedItems", verifyToken, verifyHR, async (req, res) => {
      try {
        const { hrEmail } = req.query; // Get hrEmail from query parameters

        // Step 1: Filter requests by hrEmail
        const filteredRequests = await requestCollection
          .find({ hrEmail })
          .toArray();

        // Step 2: Count the number of requests for each item
        const itemRequestCounts = filteredRequests.reduce((acc, request) => {
          acc[request.name] = (acc[request.name] || 0) + 1; // Count the requests
          return acc;
        }, {});

        // Step 3: Sort items by their request count in descending order
        const sortedItems = Object.entries(itemRequestCounts)
          .sort((a, b) => b[1] - a[1]) // Sort by request count in descending order
          .slice(0, 4); // Get top 4 items

        // Step 4: Send the response
        res.send(sortedItems.map(([name, count]) => ({ name, count })));
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch top requested items" });
      }
    });

    app.post("/requests", verifyToken, async (req, res) => {
      const { name, requestedQuantity } = req.body;
      const query = { name: name };

      try {
        const asset = await assetCollection.findOne(query);

        if (!asset) {
          return res.status(404).send({ error: "Asset not found" });
        }

        if (asset.quantity < requestedQuantity) {
          return res
            .status(400)
            .send({ error: "Insufficient quantity available" });
        }

        const result = await requestCollection.insertOne(req.body);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to handle the request" });
      }
    });
    // request returned
    app.patch("/requestReturned", verifyToken, async (req, res) => {
      const { requestId } = req.body;
      const filter = { _id: new ObjectId(requestId) };
      const updateDoc = {
        $set: {
          status: "returned",
        },
      };
      const result = await requestCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // HR fetches
    app.get("/allRequestsHR", verifyToken, verifyHR, async (req, res) => {
      try {
        const { search, email } = req.query;
        const query = {};

        if (search) {
          query.$or = [
            { requesterName: { $regex: search, $options: "i" } },
            { requesterEmail: { $regex: search, $options: "i" } },
          ];
        }
        if (email) {
          // query = {hrEmail: email}
          query.hrEmail = email;
        }

        const result = await requestCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        // console.error("Error fetching requests:", error);
        res.status(500).send({ error: "Failed to fetch requests" });
      }
    });
    //

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
          name: req.body.name,
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
          name: req.body.name,
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

    // getting a specific users request list
    app.get("/filteredRequests", verifyToken, async (req, res) => {
      try {
        const { search, requestStatus, assetType, email, hrEmail } = req.query;
        const query = {};
        if (hrEmail) {
          query.hrEmail = hrEmail;
        }
        if (email) {
          query.requesterEmail = email;
        }

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
        // console.error("Error fetching filtered requests:", error);
        res.status(500).send({ error: "Failed to fetch filtered requests." });
      }
    });


   
    
    // deletes specific request
    app.delete("/requests/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await requestCollection.deleteOne(query);
      res.send(result);
    });

    // packages
    app.get("/packages", async (req, res) => {
      const result = await packageCollection.find().toArray();
      res.send(result);
    });

    // homepage stats
    app.get("/hrStatistics", verifyToken, verifyHR, async (req, res) => {
      try {
        const { email } = req.query;

        // Fetch all employees under the given HR
        const userQuery = { hrEmail: email };
        const users = await userCollection.find(userQuery).toArray();

        // Aggregate request statuses (approved, pending, rejected)
        const requestQuery = { hrEmail: email };
        const requestStatuses = await requestCollection
          .aggregate([
            { $match: requestQuery },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray();

        // Map statuses for easier client-side rendering
        const statusCounts = {
          approved: 0,
          pending: 0,
          rejected: 0,
        };

        requestStatuses.forEach((status) => {
          statusCounts[status._id] = status.count;
        });

        res.send({ users, statusCounts });
      } catch (error) {
        res.status(500).send("Error fetching HR statistics");
      }
    });

    // hr: request per user
    app.get("/requestsPerEmployee", verifyToken, verifyHR, async (req, res) => {
      try {
        const { email } = req.query;

        const employees = await userCollection
          .find({ hrEmail: email, role: "employee" })
          .toArray();
        const employeeEmails = employees.map((emp) => emp.email);
        const pipeline = [
          { $match: { requesterEmail: { $in: employeeEmails } } },
          {
            $group: {
              _id: "$requesterEmail",
              requestCount: { $sum: 1 },
            },
          },
          {
            $sort: { requestCount: -1 },
          },
        ];
        const result = await requestCollection
          .aggregate(pipeline)
          .limit(10)
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send("Error fetching requests per employee");
      }
    });

    // homepage employee pending req
    app.get("/pendingRequest", verifyToken, async (req, res) => {
      const { email } = req.query; // Extract email from query params
      const query = { requesterEmail: email, status: "pending" };
      const result = await requestCollection.find(query).toArray();
      res.send(result);
    });
    // returned items for history
    app.get("/returnedRequest", verifyToken, async (req, res) => {
      const { email } = req.query;
      console.log(email);
      const query = { requesterEmail: email, status: "returned" };
      const result = await requestCollection.find(query).limit(4).toArray();
      console.log(result);
      res.send(result);
    });
    // employee monthly req
    app.get(
      "/employeeMonthlyRequests/:email",
      verifyToken,
      async (req, res) => {
        const { email } = req.params;

        const startOfMonth = moment().startOf("month").toDate();
        const endOfMonth = moment().endOf("month").toDate();
        const query = {
          requesterEmail: email,
          requestDate: {
            $gte: startOfMonth.toISOString(),
            $lte: endOfMonth.toISOString(),
          },
        };

        const result = await requestCollection.find(query).limit(5).toArray();

        if (!result || result.length === 0) {
          return res
            .status(404)
            .send({ message: "No requests found for this month." });
        }
        const sortedRequests = result.sort(
          (a, b) => new Date(b.requestDate) - new Date(a.requestDate)
        );
        res.send(sortedRequests);
      }
    );
    // hr: add a notice
    app.post("/addNotice", verifyToken, verifyHR, async (req, res) => {
      const notice = req.body;
      const result = await noticeCollection.insertOne(notice);
      res.send(result);
    });
    // hr: get hr published notices
    app.get("/addNotice/:email", verifyToken, verifyHR, async (req, res) => {
      try {
        const email = req.params.email;
        const result = await noticeCollection
          .find({ hrEmail: email })
          .sort({ postedDate: -1 }) // Sort by `postedDate` in descending order (most recent first)
          .limit(10) // Limit to the 10 most recent notices
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch notices" });
      }
    });
    // employee: get all request
    app.get("/addNoticeForEmployee/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const result = await noticeCollection
          .find({ hrEmail: email })
          .sort({ postedDate: -1 }) // Sort by `postedDate` in descending order (most recent first)
          .limit(10) // Limit to the 10 most recent notices
          .toArray();

        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch notices" });
      }
    });

    // hr: delete a notice
    app.delete("/deleteNotice/:id", verifyToken, verifyHR, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await noticeCollection.deleteOne(query);
      res.send(result);
    });

    // payment related apis
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      // console.log(price);
      if (!price || isNaN(price)) {
        return res.status(400).send({ error: "Invalid price value." });
      }

      const amount = parseInt(price * 100); // Convert to cents
      // console.log("Price:", price, "Amount:", amount);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        // console.error("Error creating payment intent:", error);
        res.status(500).send({ error: error.message });
      }
    });
    // save payment data
    app.post("/payments", async (req, res) => {
      const result = await paymentCollection.insertOne(req.body);
      res.send(result);
    });
    // getting payment history
    app.get(
      "/paymentHistory/:email",
      verifyToken,
      verifyHR,
      async (req, res) => {
        const email = req.params.email;
        if (!req.decoded.email === email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        const query = { hrEmail: email };
        const result = await paymentCollection
          .find(query)
          .limit(4)
          .sort({ paymentTime: -1 })
          .toArray();
        res.send(result);
      }
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
