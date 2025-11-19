const express = require('express');
const app = express();
const port=5000;
// Middleware to parse JSON bodies
app.use(express.json());
app.get("/login",(req,res)=>{
    res.send("Hello World");
});

console.log("hi ");
app.listen(port,()=>{
    console.log(`Example app listening on port ${port}`);
});