const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const ObjectId = require('mongodb').ObjectId
// const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const app = express();
require('dotenv').config()
const jwt = require('jsonwebtoken')
//middleware middle
app.use(cors());
app.use(express.json());
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);



const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.mdunt9i.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
function verifyJWT (req, res,next){
  const authHeader = req.headers.authorization;
  if(!authHeader) {
    res.status(403).send({message:'unauthorized'});
  }
  const token = authHeader.split(' ')[1]
  jwt.verify(token,process.env.ACCESS_TOKEN, function(err,decoded) {
    if(err){

      return res.status(403).send({message:'unauthorized'})
    }
    req.decoded = decoded
  })
  next()
}


async function run (){
    try {
        const availableRooms =  client.db('hotelAshrafee').collection('rooms');
        const bookingCollection =  client.db('hotelAshrafee').collection('bookings');
        const userCollection =  client.db('hotelAshrafee').collection('users');
        const paymentCollection =  client.db('hotelAshrafee').collection('payments');


     

      //admin permission
      app.get('/users/admin/:email',async (req,res)=>{
        const email = req.params.email ;
        const query = {email}
        const user = await userCollection.findOne(query)
        res.send({isAdmin: user?.role === 'admin'})

      })
        // make admin
        app.put('/users/admin/:id',verifyJWT,  async(req,res)=>{
          const decodedEmail = req.decoded.email;
          const query = {email:decodedEmail}
          const user = await userCollection.findOne(query);
          if(user?.role !== 'admin'){
            return res.status(403).send({message:'forbidden access'})
          }
          const id = req.params.id;
          const filter = {_id: new ObjectId(id)}
          const options = {upsert:true};
          const updateDoc = {
            $set:{
              role:'admin',
            }
          }
          const result  = await userCollection.updateOne(filter,updateDoc,options);
          res.send(result);
        })
        // get rooms
        app.get('/rooms', async (req, res)=>{
            const dates = req.query.dates;
            const query = {};
            const rooms = await availableRooms.find(query).toArray();
            const bookingQuery = {bookingDates:dates}
            const alreadyBooked = await availableRooms.find(bookingQuery).toArray();
           rooms.forEach(room =>{
            const roomBooked = alreadyBooked.filter(book=>book.RoomName === room.name);
            const bookedAccommodations = roomBooked.map(book=>book.accommodation);
            const remainingAccommodations = room.accommodations.filter(accommodation=> !bookedAccommodations.includes(accommodation))
            room.accommodation = remainingAccommodations
           })
            res.send(rooms);
          })

          //get rooms by id
        app.get('/rooms/:id', async (req, res)=>{
            const id = req.params.id;
            const filter = {_id: new ObjectId(id)};
            const result = await availableRooms.findOne(filter);
            res.send(result);
          })
          // get all booking by email address
          app.get('/bookings/', verifyJWT, async(req,res)=>{
            const email = req.query.email;
          const decodedEmail = req.decoded.email;
          if(email !== decodedEmail){
            return res.status(403).send({message:'forbidden access',})
          }
           const query = {email:email}
            const bookings = await bookingCollection.find(query).toArray()
            res.send(bookings)
        })
        // find specific bookings
        app.get('/bookings/:id', async(req, res) => {
          const id = req.params.id
          const query = {_id: new ObjectId(id)}
          const bookings = await bookingCollection.findOne(query)
          res.send(bookings)
        })
           // jwt token
          app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const user = await userCollection.findOne(query);
            if (user) {
              const token = jwt.sign({email}, process.env.ACCESS_TOKEN,{expiresIn:'4h'})
              return res.send({accesToken:token});
            }
            res.status(403).send({accesToken:''})
          })
         

           // post booking 
       app.post('/bookings', async (req,res) => {
        const booking = req.body;
        const query  = {
          bookingDates:booking.bookingDates,
          email: booking.email,
          RoomName: booking.RoomName
        }
        
        const alreadyBooked = await bookingCollection.find(query).toArray()
        if(alreadyBooked.length){
          const message = `Already have a booking on ${booking.bookingDates}`
          return res.send({acknowledge:false,message})
        }
        const result = await bookingCollection.insertOne(booking);
        
     
        res.send(result)
       })
        // create user 
        app.post('/users', async (req, res)=>{
          const user = req.body;
          const result = await userCollection.insertOne(user);
          res.send(result);
        })

       // get all users
       app.get('/users', async (req,res) => {
        const query = {}
        const users = await userCollection.find(query).toArray()
        res.send(users);
       })

       // payment intent here
       app.post("/create-payment-intent", async (req, res) => {
        const booking= req.body;
        const price = booking.price
        const paymentIntent = await stripe.paymentIntents.create({
          amount: price * 100,
          currency: "usd",
          "payment_method_types": [
            "card"
          ],
         
        });

        // payment update and post to database bookings
        app.post('/payments', async (req, res) =>{
          const payment = req.body;
          const result = await paymentCollection.insertOne(payment)
          const id = payment.bookingId
          const filter = {_id: new ObjectId(id)};
          const updateDoc = {
            $set:{
              paid: true,
              transactinId: payment.transactinId
            }
          }
          const updateresult = await bookingCollection.updateOne(filter, updateDoc)
          res.send(result)
        })
      
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      });

    }
    finally{

    }
}
run().catch(console.log());


app.get('/',(req,res)=>{
    res.send('hotel ashrafee is running');
})
app.listen(port,()=>console.log(`ports is ${port}`));