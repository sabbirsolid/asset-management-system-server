require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
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

    app.get('/users/roles/:email', async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email: email };
    
      try {
        const user = await userCollection.findOne(query);
    
        if (user) {
          const isHR = user.role === 'HRManager';
          const isEmployee = user.role === 'employee';
    
          return res.send({ isHR, isEmployee, user });
        }
    
        res.send({ isHR: false, isEmployee: false, user: null });
      } catch (error) {
        console.error('Error fetching user roles:', error);
        res.status(500).send({ error: 'Internal Server Error' });
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
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
