import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const FOLDER_NAME = "resume-builder";

export default class S3UploadAdapter {
    constructor(loader, s3Client, bucketName) {
        this.loader = loader;
        this.s3Client = s3Client;
        this.bucketName = bucketName;
    }

    async upload() {
        try {
            const file = await this.loader.file;

            // Validate file type
            if (!file.type.startsWith('image/')) {
                throw new Error('Only image files are allowed');
            }

            // Validate file size (2MB limit)
            const maxSizeMB = 2;
            const maxBytes = maxSizeMB * 1024 * 1024;
            if (file.size > maxBytes) {
                throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
            }

            // Generate unique filename to avoid collisions
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 8);
            const fileExtension = file.name.split('.').pop();
            const fileName = `${timestamp}_${randomString}.${fileExtension}`;
            const key = `${FOLDER_NAME}/${fileName}`;

            // Upload to S3
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: file,
                ContentType: file.type,
            });

            await this.s3Client.send(command);

            // Generate signed URL for the uploaded image
            const getCommand = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
                expiresIn: 3600 // 1 hour
            });

            return {
                default: signedUrl
            };
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }

    abort() {
        // Implement abort logic if needed
        console.log('Upload aborted');
    }
}
