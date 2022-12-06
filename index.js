const express = require("express");
const cors = require("cors");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  ObjectID,
} = require("mongodb");

const jwt = require("jsonwebtoken");

require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tdieq2y.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

//verify jwt
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("UnAuthorized Access");
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      console.log(err);

      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const categoriesCollection = client
      .db("whichBook")
      .collection("categories");
    const productCollection = client.db("whichBook").collection("product");
    const usersCollection = client.db("whichBook").collection("users");
    const bookingsCollection = client.db("whichBook").collection("bookings");
    const AddProductsCollection = client
      .db("whichBook")
      .collection("addProducts");
    const paymentsCollection = client.db("whichBook").collection("payments");

    // get all categories
    app.get("/categories", async (req, res) => {
      const query = {};
      const result = await categoriesCollection.find(query).toArray();
      res.send(result);
    });

    // get Product
    app.get("/categories/:categoryId", async (req, res) => {
      const categoryId = req.params.categoryId;
      //   console.log(categoryId);
      const filter = { _id: ObjectId(categoryId) };
      const result = await categoriesCollection.findOne(filter);
      const query = { categoryId: result.categoryId };
      const categories = await productCollection.find(query).toArray();
      res.send(categories);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedResult = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    // jwt
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1d",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });
    // for admin user
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.userType === "admin" });
    });
    // for seller
    app.get("/users/seller/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isSeller: user?.userType === "seller" });
    });
    // for buyer
    app.get("/users/buyer/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isBuyer: user?.userType === "buyer" });
    });

    // create user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // delete user
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await AddProductsCollection.deleteOne(filter);
      res.send(result);
    });

    // get bookings
    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      // console.log("token", req.headers.authorization);

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    // booking id get
    app.get("/bookings/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
    });

    // create bookings
    app.post("/bookings", verifyJWT, async (req, res) => {
      const booking = req.body;
      // console.log(booking)
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    // AddProduct get
    app.get("/addProducts", verifyJWT, async (req, res) => {
      const query = {};
      const result = await AddProductsCollection.find(query).toArray();
      res.send(result);
    });

    // AddProduct  Post
    app.post("/addProducts", verifyJWT, async (req, res) => {
      const product = req.body;
      const result = await AddProductsCollection.insertOne(product);
      res.send(result);
    });

    // delete my product
    app.delete("/addProducts/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await AddProductsCollection.deleteOne(filter);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("WhichBook portal server is running");
});
app.listen(port, () => console.log(`WhichBook running on ${port}`));
