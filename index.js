const program = require("commander");
const fs = require("fs");
const textractScan = require("./textractUtils");

const path = require('path');
const pdf = require('pdf-poppler');

const mysql = require('mysql');
const util = require('util');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'textract'
});

const query = util.promisify(connection.query).bind(connection);

async function convertPdf(filePath) {
  const saved_folder = "converts";
  const format = "png";
  const out_dir = 'C:\\Users\\User\\Documents\\GitHub\\textract-lab\\' + saved_folder;
  const out_prefix = /*path.basename(filePath, path.extname(filePath)) + "-"*/ "one_image";
  const page = 1;
  const saved_path = saved_folder + "/" + out_prefix + "-" + page + "." + format;

  let opts = {
      format: format,
      out_dir: out_dir,
      out_prefix: out_prefix,
      page: page,
      scale: 1096
  }
  
  return pdf.convert(filePath, opts)
    .then(async res => {
        console.log('Successfully converted. Image saved in: ' + saved_path);
        console.log('Converting...');
        return saved_path;
    })
    .catch(error => {
        console.error(error);
    });
}


function recFindByExt(base,ext,files,result) {
  files = files || fs.readdirSync(base) 
  result = result || [] 

  files.forEach( 
      function (file) {
          var newbase = path.join(base,file)
          if ( fs.statSync(newbase).isDirectory()) {
              result = recFindByExt(newbase,ext, fs.readdirSync(newbase), result)
          }
          else {
              if ( file.substr(-1*(ext.length+1)) == '.' + ext ) {
                  result.push(newbase);
              }
          }
      }
  )
  return result;
}

async function processPDF(filePath) {
  if(filePath.endsWith("png") || filePath.endsWith("jpg") || filePath.endsWith("jpeg") || filePath.endsWith("pdf")) {
    const image_path = await convertPdf(filePath);
    const data = fs.readFileSync(image_path);
    const results = await textractScan(data);
    console.log(results);
    return savedDb(filePath, results);
  }else {
    console.log('File is not a Image or PDF');
  }
}

async function checkDb(filePath) {

  return (async () => {
    const rows = await query('SELECT * FROM scans WHERE file_path = ?',[filePath]);
    if(rows.length > 0) {
      console.log('PDF is already scanned: ' + filePath);
      return true;
    }else {
      return false;
    }
  })()
}

function getValue(keys, results) {
  for (let i in keys) {
    const key = keys[i];
    if(key in results) {
      return results[key];
    }
  }
  return null;
}

async function savedDb(filePath, results) {

  const pdf = {
    file_path: filePath,
    firmname: getValue(['Name of Establishment'], results),
    coordinates: getValue(['Coordinates'], results),
    proponent: getValue(['Proponent Name'], results),
    address: getValue(['Address'], results)
  }

  return (async () => {
    const res = await query('INSERT INTO scans SET ?', pdf);
    if(res.insertId !== null && res.insertId !== undefined) {
      return false;
    }else {
      console.log('PDF is already scanned: ' + filePath);
      return true;
    }
  })()
}

program.version("0.0.1").description("Textract Lab");
program
  .command("scan <filePath> [excelPath]")
  .alias("s")
  .description("scans a file")
  .action(async (filePath, excel) => {

    return connection.connect(async (err) => {
      if(err){
        console.log('Error connecting to Db');
        console.log(err);
        return;
      }
      console.log('Connection established');

      if(fs.lstatSync(filePath).isFile()) {
        processPDF(filePath);
      }else {
        const ext_file_list = recFindByExt(filePath, 'pdf');
        for (let i in ext_file_list) {
          const isExisted = await checkDb(ext_file_list[i]);
          if (!isExisted) {
            await processPDF(ext_file_list[i]);
          }
        }
        console.log('DONE: ' + ext_file_list.length + " scanned files.");
      }
    });
  });

program.parse(process.argv);
