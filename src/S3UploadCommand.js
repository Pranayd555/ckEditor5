import { PutObjectCommand } from '@aws-sdk/client-s3';
import { showWarning } from './utils';
import { Command } from 'ckeditor5';

export default class S3UploadCommand extends Command {

    constructor(editor, s3Client) {
        super(editor);
        this.s3Client = s3Client;

        this.listenTo(this.editor.model.document, 'change', () => this.refresh());
    }

    execute() {
        this.uploadFilesToS3();
    }

    uploadFilesToS3() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.multiple = true;

        fileInput.onchange = async (event) => {
            const files = Array.from(event.target.files);
            try {
                await Promise.all(files.map(file => this.uploadFileToS3(file)));
                showSuccess(this.editor, 'Success', true, 'Files uploaded successfully!', true);
            } catch (error) {
                showWarning(this.editor, 'Upload Failed', true, `Error uploading files: ${error.message}`, true);
            }
        };

        fileInput.click();
    }

    async uploadFileToS3(file) {
        const bucketName = 'pranay-poc-bucket'; // Replace with your bucket name
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: file.name,
            Body: file,
            ContentType: file.type,
        });

        try {
            await this.s3Client.send(command);
        } catch (error) {
            throw new Error(`Failed to upload ${file.name}: ${error.message}`);
        }
    }


    refresh() {
        // Set this.isEnabled based on whether a file can be uploaded
        const selection = this.editor.model.document.selection;
        // You can set conditions based on the editor state
        console.log('Refreshing S3UploadCommand:', this.editor, this.isEnabled);
        this.isEnabled = true; // Enable if conditions are met
    }
}
