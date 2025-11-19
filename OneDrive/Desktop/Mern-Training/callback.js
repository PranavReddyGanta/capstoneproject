function outer(name, callback) {
    console.log('Hello'+ name);
    callback();
}
function internal(name) {
  console.log("how are you");
}
outer('Pranav', internal);
//in this example we are passing function as an argument to another function and
// calling it back inside that function so this is called callback function.