import swaggerJsdoc from "swagger-jsdoc";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ExpenseTrack APIs",
      version: "1.0.0",
      description: "API documentation for ExpenseTrack Backend Server",
    },
    servers: [
      {
        url: "/",
      },
    ],
  },
  apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export default swaggerSpec;
