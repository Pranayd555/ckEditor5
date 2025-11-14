# CKEditor 5 with S3 File Manager

This project integrates a custom S3 File Manager plugin into CKEditor 5, allowing users to browse and upload files directly to an Amazon S3 bucket or Cloudflare R2 bucket.

## DEMO
![Demo GIF](./assets/demo.gif)

## Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/Pranayd555/ckEditor5.git
    cd ckEditor5
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**

    Create a `.env` file in the project root with the following variables:

    ```
    AWS_REGION=YOUR_AWS_REGION
    AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY
    S3_BUCKET_NAME=YOUR_S3_BUCKET

    R2_ACCOUNT_ID=YOUR_R2_ACCOUNT_ID
    R2_API=YOUR_R2_API_URL
    R2_BUCKET_NAME=YOUR_R2_BUCEKT_NAME
    R2_TOKEN_VALUE=YOUR_R2_TOKEN_VALUE
    R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
    R2_SECRECT_ACCESS_KEY=YOUR_R2_SECRECT_ACCESS_KEY
    ```

    *Note: For security reasons, avoid committing your `.env` file to version control.*

## Building the Project

To build the CKEditor 5 custom bundle, run:

```bash
npm run build
```

This will generate the `ckeditor.js` and `ckeditor.js.map` files in the `build/` directory.

## Running the Application

To start a local development server and preview the CKEditor instance, run:

```bash
npm start
```

This will serve the project from `http://localhost:8080` (or another available port) and you can access the sample editor at `http://localhost:8080/samples/index.html`.

## CORS Policy for R2 or S3

To allow cross-origin requests, you need to configure a CORS policy on your R2 or S3 bucket. Here's an example policy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:8080"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ]
  }
]
```
