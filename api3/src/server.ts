import app from "./app";

const server = app.listen(app.get("port"), () => {
    console.log(`App running on port ${app.get("port")}`);
})

export default server;