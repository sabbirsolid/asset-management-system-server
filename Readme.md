# Asset Management System - Backend

The **Asset Management System (AMS) Backend** is a RESTful API built to support the frontend application of the Asset Management System. This backend manages authentication, database operations, and payment integrations, providing a robust foundation for the AMS.

---

## Features
- **Authentication and Authorization**: Secure authentication using JSON Web Tokens (JWT).
- **Payment Integration**: Stripe API for handling payments and subscriptions.
- **Database Management**: MongoDB for efficient asset and user data storage.
- **Environment Configuration**: Environment variables handled securely with `dotenv`.
- **CORS Support**: Cross-origin requests managed using the CORS library.
- **Timestamps**: Timestamps and formatting with Moment.js for logs and time-sensitive data.

---

## Tech Stack
### Core Frameworks and Libraries
- **Express**: Lightweight and fast Node.js framework for building RESTful APIs.
- **MongoDB**: NoSQL database for scalable and flexible data storage.

### Utilities
- **JWT**: Secure token-based authentication.
- **Stripe**: Payment gateway for subscription-based services.
- **Moment.js**: Simplified time manipulation and formatting.
- **dotenv**: Environment variable management for secure configurations.
- **CORS**: Handles cross-origin requests.

### Development Tools
- **Nodemon**: Automatically restarts the server during development.

---

## Client Side Live Link

Experience the Asset Management System in action: [Live Demo](https://asset-management-system-f226e.web.app)