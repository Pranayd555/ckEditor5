import { Plugin, ButtonView } from 'ckeditor5';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import uploadIcon from './assets/icons/upload.svg';

export default class S3UploadPlugin extends Plugin {
    static get pluginName() {
        return 'S3UploadPlugin';
    }

    init() {
        const editor = this.editor;

        // Add the upload button to the toolbar
        editor.ui.componentFactory.add('uploadToS3', locale => {
            const button = new ButtonView(locale);

            button.set({
                label: 'Upload to S3',
                icon: uploadIcon,
                tooltip: true
            });

            // Execute the upload command when the button is clicked
            button.on('execute', () => {
                this.uploadFileToS3();
            });

            return button;
        });
    }

    async uploadFileToS3() {
        // Configure the S3 client
        const s3Client = new S3Client({
            region: 'eu-north-1', // e.g., 'us-west-2'
            credentials: {
                accessKeyId: '',
                secretAccessKey: ''
            }
        });

        const fileInput = document.createElement('input');
        fileInput.type = 'file';

        // Handle file selection
        fileInput.onchange = async () => {
            const file = fileInput.files[0];
            if (!file) {
                return;
            }

            // Create a PutObjectCommand to upload the file
            const command = new PutObjectCommand({
                Bucket: 'pranay-poc-bucket',
                Key: file.name,
                Body: file,
                ContentType: file.type
            });

            try {
                const data = await s3Client.send(command);
                console.log('Success', data);
                this.editor.execute('notification', {
                    message: 'File uploaded successfully!',
                    type: 'success'
                });
            } catch (error) {
                console.error('Error', error);
                this.editor.execute('notification', {
                    message: 'Failed to upload file.',
                    type: 'error'
                });
            }
        };

        fileInput.click(); // Open the file dialog
    }
}
