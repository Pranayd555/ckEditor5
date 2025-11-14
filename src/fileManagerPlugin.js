import { Plugin, Notification, ButtonView } from 'ckeditor5';
import { S3Client } from '@aws-sdk/client-s3';
import iconUpload from './assets/icons/upload.svg';
import iconS3 from './assets/icons/file-manager.svg'; // Replace with your own icon
import S3BrowserCommand from './S3BrowseCommand';


export default class AmazonS3Plugin extends Plugin {

    static get pluginName() {
        return 'AmazonS3';
    }

    static get requires() {
        return [Notification];
    }

    init() {
        // Initialize S3 client
        console.log('FileManagerPlugin is initialized!');
        // connect aws s3
        // this.s3Client = new S3Client({
        //     region: process.env.AWS_REGION || 'eu-north-1',
        //     credentials:{
        //         accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        //         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
        //     },
        // });
        // connect cloudflare R2
        this.s3Client = new S3Client({
            region: "auto",
            endpoint: process.env.R2_API || 'https://<ACCOUNT_ID>.r2.cloudflarestorage.com',
            signatureVersion: 'v4',
            credentials:{
                accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.R2_SECRECT_ACCESS_KEY || ''
            },
        });

        // Add commands
        this.editor.commands.add('s3Browse', new S3BrowserCommand(this.editor, this.s3Client));
        // this.editor.commands.add('s3Upload', new S3UploadCommand(this.editor, this.s3Client));

        // Inside your plugin or editor setup code
        this.editor.conversion.for('downcast').elementToElement({
            model: 'audio',
            view: (modelElement, { writer }) => {
                const audioSourceUrl = modelElement.getAttribute('src');
                const audioType = modelElement.getAttribute('type');
                const audioElement = writer.createContainerElement( 'figure', { class: 'audio' }, [
                     	writer.createContainerElement( 'audio', { controls: true }, [
                            writer.createEmptyElement('source', {
                                src: audioSourceUrl,
                                type: audioType
                            })
                        ] ),
                     	writer.createContainerElement( 'figcaption' )
                     ] );
        
                return audioElement; // Return the figure container with the audio tag
            }
        });
        


        // Add UI buttons
        this._addButtons();
    }

    _addButtons() {
        const componentFactory = this.editor.ui.componentFactory;
        const t = this.editor.t;

        // Upload button
        componentFactory.add('s3Upload', locale => {
            const command = this.editor.commands.get('s3Upload');
            const button = new ButtonView(locale);

            button.set({
                label: t('Upload image or file to S3'),
                icon: iconUpload,
                tooltip: true
            });

            button.bind('isEnabled').to(command);
            button.on('execute', () => {
                this.editor.execute('s3Upload');
                this.editor.editing.view.focus();
            });

            return button;
        });

        // Browse button
        componentFactory.add('s3Browse', locale => {
            const command = this.editor.commands.get('s3Browse');
            const button = new ButtonView(locale);

            button.set({
                label: t('Browse files in S3'),
                icon: iconS3,
                tooltip: true
            });

            button.bind('isEnabled').to(command);
            button.on('execute', () => {
                this.editor.execute('s3Browse');
                this.editor.editing.view.focus();
            });

            return button;
        });
    }
}
