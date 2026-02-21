 
 
const express = require("express")
const router = new express.Router()
const auth = require("../middleware/auth")
 

router.post('/api/query-with-extent',  auth, (req ,res) => {
    //console.log(req.body); // <-- your JSON object from React
    const { minX, minY, maxX, maxY } = req.body;
    res.json({ message: "Received!" });
})

 

module.exports = router