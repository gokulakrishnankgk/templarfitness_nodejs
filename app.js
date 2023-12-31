const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
require('dotenv').config();
const knex = require("./Database/DBConnect");
const { execSync, exec } = require('child_process');
const config = require('./config');
const pathdir = require('path');
const fs = require('fs');
const {glob} = require('glob');
const sendSlack = require('./Controller/SlackWebhook');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

  
const videoConversion = async (req, res) => {
    const [setting] = await knex.select('video_conversion', 'thumbnail_mobile', 'thumbnail_desktop', 'watermark').from('admin_settings');
        if (setting.video_conversion == 'off') {
            console.log(`MediaId: ${mediaId} Video Conversion Turned Off in Admin Settings!! \n\n`);
            process.exit();
        }

        let thumbSize1 = setting.thumbnail_mobile;
        let thumbSize2 = setting.thumbnail_desktop;

        if (!thumbSize1 > 0 || !thumbSize2 > 0) {
            console.log(`MediaId: ${mediaId} Add Valid Thumbnail Width for Mobile/Desktop in Admin Settings!! \n\n`);
            process.exit();
        }
        var mediaId = process.env.MEDIA_ID;
        // if (mediaId) {

        //     var [media] = await knex.select('id', 'user_id', 'video').from('media').where('type', '=', 'video')
        //         .where('video', '<>', '')
        //         .where('status', '=', 'active')
        //         .where('id', '=', mediaId)
        //         .limit(1);

        // } else {

        //     var mediaCheck = await knex.select('id').from('media').where('type', '=', 'video')
        //         .where('video', '<>', '')
        //         .where('conversion_status', '=', '1')
        //         .where('status', '=', 'active')
        //         .limit(1);

        //     if (mediaCheck) {

        //         console.log("\n\n Already Conversion in Progress!! \n\n");
        //         return;
        //     }

        //     var [media] = await knex.select('id', 'user_id', 'video').from('media').where('type', '=', 'video')
        //         .where('video', '<>', '')
        //         .where('conversion_status', '=', '0')
        //         .where('status', '=', 'active')
        //         .orderBy('id', 'desc')
        //         .limit(1);  
        // }
        
        if(mediaId){
            
            var datetime = new Date();

            await knex('media').where('id', '=', mediaId).update({conversion_status : '1', conversion_start_time : datetime});

            // if(mediaId){
            //     // Log::channel('command')->info("MANUAL RUN - Media ID : ".$media->id);
            
            // } else {
            //     // Log::channel('command')->info("Media ID : ".$media->id);
            // }
            // Log::channel('command')->info("Update ID : ".$media->updates_id);

            try {
                const path_video  = process.env.CONVERTED_FILE;//downloaded file from s3 will be pasted here
                const mediaName = process.env.VIDEO;//media name

                //downloading video from s3 bucket
                const { Body } = await s3.getObject({Bucket: process.env.AWS_BUCKET,Key: process.env.S3_BUCKETKEY}).promise()
                fs.writeFileSync(config.path.conversion + mediaName, Body);
                
                const localFile = config.path.conversion;
                const escapeShellArg = arg => `'${arg.replace(/'/g, "'\\''")}'`;


                const codeCheck = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=nokey=1:noprint_wrappers=1 "${localFile+mediaName}"`;
                const codecName = execSync(codeCheck, { encoding: 'utf8' }).trim();
                
                // Log::channel('command')->info('Codec Name : '.$codecName);
                
                //Adding Public Path to use for FFMPEG command which has original extension of file
                const file = config.path.conversion+mediaName;
                //Taking the Original File Name without Extension
                const filename = pathdir.parse(file).name;
                //Local Path without extension of filename to generate m3u8 extension in FFMPEG command
                const newfile = localFile+filename;

                const command = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${file}"`;
                const output = execSync(command, {encoding: 'utf-8'}).trim();

                const audioCheckCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${file}"`;
                const has_audio = (execSync(audioCheckCmd, {encoding: 'utf-8'}).trim()) == "audio" ? true : false ; 

                const width = output.split(",")[0];
                const height = output.split(",")[1];

                // Log::channel('command')->info('Width x Height : '.$width.'x'.$height);

                /*
                width >= 720 & height >=720 height 720 width -2
                width >=720 && height <720 height -2 width 720
                width <720 && height >=720 height 720 width -2
                width <720 && height <720
                Generate only 480 files
                if width <480 && height <480
                    (orginal video)
                else 
                    width >= 480 & height >=480  height 480 width -2
                    width >=480 && height <480   height -2 width 480
                   width <480 && height >=480   height 480 width -2
                */ 

                if(width == 0 && height == 0){
                    
                    console.log(`MediaId: ${mediaId} Invalid File!! Width or Height is 0!! \n\n`);
                    // sendSlack('Error', 'Invalid File!! Width or Height is 0!!')
                    process.exit();

                } else {
                    let url, fontSize, opacity, fontSize_480;
                    if(setting.watermark == "on"){
                        const [userName] = await knex.select('username').from('creators').where('id', '=', process.env.USER_ID).pluck('username');
                        if(width >= 720) {
                            fontSize = 24;
                            fontSize_480 = 18;
                        } else if(width >= 480) {
                            fontSize = 18;
                            fontSize_480 = 18;
                        } else {
                            fontSize = 14;
                            fontSize_480 = 14;
                        }

                        url = process.env.WATERMARK_URL + "/" + userName;
                        opacity = 1;

                    } else {
                        url   = " ";
                        fontSize = 0;
                        opacity = 0;
                    }
                    
                    let fontPath = config.path.public + 'webfonts/arial.TTF'; //Test single,double & copy with watermark
                    let watermarkCmd, cmd, codecConversionCmd;

                    if(codecName != "h264") {

                        watermarkCmd = "; [v1hevc]drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize +":x=(w-text_w-10):y=(h-text_h-10)[v1watermark]; [v2hevc]drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize_480 +":x=(w-text_w-10):y=(h-text_h-10)[v2watermark]";
                    } else {

                        watermarkCmd = "; [v1out]drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize +":x=(w-text_w-10):y=(h-text_h-10)[v1watermark]; [v2out]drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize_480 +":x=(w-text_w-10):y=(h-text_h-10)[v2watermark]";
                    }

                    let audio, audioStreamMap, audioFlag;

                    if(has_audio){
                        audio = "-map a:0 -c:a:0 aac -b:a:0 96k -ac 2 -map a:0 -c:a:1 aac -b:a:1 96k -ac 2";
                        audioStreamMap = "-var_stream_map \"v:0,a:0 v:1,a:1\" ";
                        audioFlag = 'Yes';
                    } else {
                        audio = "";
                        audioStreamMap = "-var_stream_map \"v:0 v:1\" ";
                        audioFlag = 'No';
                    }

                    if((width >= 720 && height >= 720) || (width < 720 && height >= 720)) {

                        if(codecName != "h264") {

                            cmd = " -filter_complex \"[0:v]scale=w=-2:h=720[v1out]; [0:v]scale=w=-2:h=480[v2out]; [v1out]format=yuv420p[v1hevc]; [v2out]format=yuv420p[v2hevc]" + watermarkCmd +"\" -map [v1watermark] -c:v:0 libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v:0 5M -maxrate:v:0 5M -minrate:v:0 5M -bufsize:v:0 5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 -map [v2watermark] -c:v:1 libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v:1 0.5M -maxrate:v:1 0.5M -minrate:v:1 0.5M -bufsize:v:1 0.5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 "+ audio +" -f hls -hls_time 2 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename "+ escapeShellArg(newfile) +"_%v_%02d.ts -master_pl_name "+ escapeShellArg(filename) +".m3u8 " + audioStreamMap + escapeShellArg(newfile) +"_%v.m3u8";
                        } else {

                            cmd = " -filter_complex \"[0:v]split=2[v1][v2]; [v1]scale=w=-2:h=720[v1out]; [v2]scale=w=-2:h=480[v2out]" + watermarkCmd +"\" -map [v1watermark] -c:v:0 libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v:0 5M -maxrate:v:0 5M -minrate:v:0 5M -bufsize:v:0 5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 -map [v2watermark] -c:v:1 libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v:1 0.5M -maxrate:v:1 0.5M -minrate:v:1 0.5M -bufsize:v:1 0.5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 "+ audio +" -f hls -hls_time 2 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename "+ escapeShellArg(newfile) +"_%v_%02d.ts -master_pl_name "+ escapeShellArg(filename) +".m3u8 " + audioStreamMap + escapeShellArg(newfile) +"_%v.m3u8";
                        }
                    } else if(width >= 720 && height < 720) {

                        if(codecName != "h264") {

                            cmd = " -filter_complex \"[0:v]scale=w=720:h=-2[v1out]; [0:v]scale=w=720:h=-2[v2out]; [v1out]format=yuv420p[v1hevc]; [v2out]format=yuv420p[v2hevc]" + watermarkCmd +"\" -map [v1watermark] -c:v:0 libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v:0 5M -maxrate:v:0 5M -minrate:v:0 5M -bufsize:v:0 5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 -map [v2watermark] -c:v:1 libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v:1 0.5M -maxrate:v:1 0.5M -minrate:v:1 0.5M -bufsize:v:1 0.5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 "+ audio +" -f hls -hls_time 2 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename "+ escapeShellArg(newfile) +"_%v_%02d.ts -master_pl_name "+ escapeShellArg(filename) +".m3u8 " + audioStreamMap + escapeShellArg(newfile) +"_%v.m3u8";
                        } else {

                            cmd = " -filter_complex \"[0:v]split=2[v1][v2]; [v1]scale=w=720:h=-2[v1out]; [v2]scale=w=720:h=-2[v2out]" + watermarkCmd +"\" -map [v1watermark] -c:v:0 libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v:0 5M -maxrate:v:0 5M -minrate:v:0 5M -bufsize:v:0 5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 -map [v2watermark] -c:v:1 libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v:1 0.5M -maxrate:v:1 0.5M -minrate:v:1 0.5M -bufsize:v:1 0.5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 "+ audio +" -f hls -hls_time 2 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename "+ escapeShellArg(newfile) +"_%v_%02d.ts -master_pl_name "+ escapeShellArg(filename) +".m3u8 " + audioStreamMap + escapeShellArg(newfile) +"_%v.m3u8";
                        }
                    } else if(width < 720 && height < 720) {

                        if (has_audio) {
                            audio = "-map a:0 -c:a aac -b:a 96k -ac 2";
                        } else {
                            audio = "";
                        }

                        if(width < 480 && height < 480) {
                            
                            if(codecName != "h264") {
                                
                                watermarkCmd =" -filter_complex \"[0:v]format=yuv420p[v0hevc]; drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize +":x=(w-text_w-10):y=(h-text_h-10)[v1watermark]\" -map [v0hevc] -map [v1watermark]";
                                
                            } else {
                                
                                watermarkCmd =" -filter_complex \"drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize +":x=(w-text_w-10):y=(h-text_h-10)\"";

                            }
                                                        
                            cmd = watermarkCmd +" -c:v libx264 -preset veryslow -crf 18 -c:a copy -f hls -hls_time 2 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename "+ escapeShellArg(newfile) +"_%v_%02d.ts -master_pl_name "+ escapeShellArg(filename) +".m3u8 "+ escapeShellArg(newfile) +"_%v.m3u8";

                        } else {

                            if(codecName != "h264") {

                                codecConversionCmd = ",format=yuv420p[v0hevc]";
                                watermarkCmd = ";[v0hevc]drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize +":x=(w-text_w-10):y=(h-text_h-10)";

                            } else {

                                codecConversionCmd = "";
                                watermarkCmd = ",drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize +":x=(w-text_w-10):y=(h-text_h-10)";

                            }

                            if((width >= 480 && height >= 480) || (width < 480 && height >= 480)) {
                                
                                // $cmd = " -filter_complex \"[0:v]scale=w=-2:h=480" . $watermarkCmd ."[vout]\" -map [vout] -c:v libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v 0.5M -maxrate:v 0.5M -minrate:v 0.5M -bufsize:v 0.5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 ". $audio ." -f hls -hls_time 2 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename ". escapeShellArg($newfile) ."_%v_%02d.ts -master_pl_name ". escapeShellArg($filename) .".m3u8 ". escapeShellArg($newfile) ."_%v.m3u8";
                                
                                cmd = " -filter_complex \"[0:v]scale=w=-2:h=480"+ codecConversionCmd + watermarkCmd +"[vout]\" -map \"[vout]\" -c:v libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v 0.5M -maxrate:v 0.5M -minrate:v 0.5M -bufsize:v 0.5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 "+ audio +" -f hls -hls_time 2 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename "+ escapeShellArg(newfile) +"_%v_%02d.ts -master_pl_name "+ escapeShellArg(filename) +".m3u8 "+ escapeShellArg(newfile) +"_%v.m3u8";

                            } else if(width >= 480 && height < 480) {
                                cmd = " -filter_complex \"[0:v]scale=w=480:h=-2"+ codecConversionCmd + watermarkCmd +"[vout]\" -map \"[vout]\" -c:v libx264 -x264-params \"nal-hrd=cbr:force-cfr=1\" -b:v 0.5M -maxrate:v 0.5M -minrate:v 0.5M -bufsize:v 0.5M -preset veryslow -crf 18 -g 48 -sc_threshold 0 -keyint_min 48 "+ audio +" -f hls -hls_time 2 -hls_playlist_type vod -hls_flags independent_segments -hls_segment_type mpegts -hls_segment_filename "+ escapeShellArg(newfile) +"_%v_%02d.ts -master_pl_name "+ escapeShellArg(filename) +".m3u8 "+ escapeShellArg(newfile) +"_%v.m3u8";

                            }
                        }
                    }
                    let videoDuration = execSync("ffprobe -i "+ escapeShellArg(file) +" -show_entries format=duration -v quiet -of csv=\"p=0\"", {encoding: 'utf-8'}).trim();
                      // Log::channel('command')->info('Video Duration : '.$videoDuration);

                    const ffmpegCmd = "ffmpeg -i " + escapeShellArg(file) + cmd;
                    execSync(ffmpegCmd);
                    
                    // Log::channel('command')->info('FFMPEG Command : '.$ffmpegCmd);

                    let thumbnail = true, thumbDuration;

                    if(videoDuration >= 5.0) {
                        thumbDuration = " -ss 00:00:05.000";
                    } else if (videoDuration >= 2.0 && videoDuration < 5.0) {
                        thumbDuration = " -ss 00:00:02.000";
                    } else if (videoDuration >= 1.0 && videoDuration < 2.0) {
                        thumbDuration = " -ss 00:00:01.000";
                    } else {
                        thumbnail = false;
                    }


                    if(thumbnail) {
                        let thumbnailCmd = "ffmpeg -i " + escapeShellArg(file) + thumbDuration +" -vframes 1 -filter_complex \"drawtext=fontfile="+ fontPath +":text="+ url +":fontcolor=#eaeaea@"+ opacity +":fontsize="+ fontSize +":x=(w-text_w-10):y=(h-text_h-10)\" -lossless 1 -quality 80 " + escapeShellArg(newfile) + ".webp";
                        execSync(thumbnailCmd);
                        // Log::channel('command')->info('Thumbnail Command : '.$thumbnailCmd);

                        let generatedThumb = newfile +".webp";
                        let thumbnailResizeCmd1 = "ffmpeg -i " + escapeShellArg(generatedThumb) + " -vf \"scale=w=" + thumbSize1 + ":h=-2\" "  + escapeShellArg(newfile) +  "_" + thumbSize1 + ".webp";
                        let thumbnailResizeCmd2 = "ffmpeg -i " + escapeShellArg(generatedThumb) + " -vf \"scale=w=" + thumbSize2 + ":h=-2\" "  + escapeShellArg(newfile) +  "_" + thumbSize2 + ".webp";

                        execSync(thumbnailResizeCmd1) ;
                        execSync(thumbnailResizeCmd2);

                        // Log::channel('command')->info('Thumbnail Resize Command Mobile: '.$thumbnailResizeCmd1);
                        // Log::channel('command')->info('Thumbnail Resize Command Desktop: '.$thumbnailResizeCmd2);
                        fs.unlinkSync(generatedThumb);//deletes the generated thumbnail
                }

                fs.unlinkSync(localFile+mediaName);//deletes the source file used to convert

                // Get all the files in the directory that match the pattern
                let files = glob.sync(`${localFile}/${filename}*`);
                let m3u8Count = 0;
                let tsCount = 0;
                // Loop through the files and move them to the destination directory
                for(const file of files) {
                    // Define the destination file path
                    let destinationFilePath = path_video + pathdir.parse(file).base;

                    if(pathdir.extname(file) == '.m3u8') {
                        m3u8Count +=1;
                    }

                    if(pathdir.extname(file) == '.ts') {
                        tsCount +=1;
                    }
                    // Move the file
                    let fileStream = fs.readFileSync(file);
                    await s3.upload({Bucket:process.env.AWS_BUCKET,Key:destinationFilePath,Body: fileStream}).promise();

                    // Remove the file from the local path
                    fs.unlinkSync(file);
                };

                if(thumbnail){
                    await knex('media').where('id', '=', mediaId).update({video_poster : filename, thumb_mobile_width : thumbSize1, thumb_desktop_width: thumbSize2});
                }
                if(m3u8Count > 0 && tsCount > 0) {
                    await knex('media').where('id', '=', mediaId).update({conversion_status : '2'});
                    // Log::channel('command')->info('Status -> Success : Video Converted!!');

                } else {
                    await knex('media').where('id', '=', mediaId).update({conversion_status : '3'});
                    console.log(`MediaId: ${mediaId} Conversion Failed : Unidentified Error!!`);
                    // sendSlack('Error', 'Status -> Failed : Unidentified Error!!');
                    process.exit();
                    // Log::channel('command')->error('Status -> Failed : Video Conversion Error!!');
                }         
                // Log::channel('command')->info('Filename : '.$filename);           
            }

            } catch (error) {
                console.log(`MediaId: ${mediaId} ${error}`);
                // sendSlack('Error', error);
                process.exit();
            }
            if((await knex('media').select('conversion_status').where({id:mediaId}) == mediaId) == '1') {

                await knex('media').where('id', '=', mediaId).update({conversion_status : '3'});
                console.log(`MediaId: ${mediaId} Conversion Failed : Unidentified Error!!`);
                // sendSlack('Error', 'Status -> Failed : Unidentified Error!!');
                process.exit();
                // Log::channel('command')->error('Status -> Failed : Unidentified Error!!');
            }
            var datetime = new Date();
            await knex('media').where('id', '=', mediaId).update({conversion_end_time : datetime});
            console.log(`MediaId: ${mediaId} Video Conversion Process Completed`);
            // Log::channel('command')->info('MediaId: 123 Process Completed : Check Conversion Status for Media ID -> '.$media->id);
            process.exit();

        } else {
            console.log(`MediaId: ${mediaId} Status failed`);
            process.exit();
            // Log::channel('command')->info('Status -> Failed : No Media Found');
        }   
};

server.listen(3000, ()=>{
    console.log('server is started at port 3000');
    videoConversion();

});