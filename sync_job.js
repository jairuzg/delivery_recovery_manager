const yargs = require('yargs');
const constants = require('./common/moduleConstants');
const {connMysqlB, connMysqlA, connMysqlC, getMysqlConnection} = require("./db/mysql_connections");
const {connFb} = require('./db/firebase_connections');
const {
    getInaccurateOrdersFromMysql, transferOrderToAnotherServer, transferOrdersToExternalDB,
    fetchOrdersWithoutExternalDBId
} = require("./db/orders");
const {logger} = require("./common/logger");
const {fetchPaymentsWithoutExternalDBId} = require("./db/payments");
const {transferPaymentsToExternalDB} = require("./services/payment_service");

function getInaccurateDataFromServer(serverName, callback) {
    const connMysql = getMysqlConnection(serverName);
    getInaccurateOrdersFromMysql(connMysql, serverName, function (orders) {
        callback(orders);
    });
}

function getDataWithoutExternalDBId(serverName, callback) {
    const connMysql = getMysqlConnection(serverName);
    fetchOrdersWithoutExternalDBId(connMysql, serverName, (errors, orders) => {
        callback(errors, orders);
    });
}

function getPaymentDataWithoutExternalDBId(serverName, callback) {
    const connMysql = getMysqlConnection(serverName);
    fetchPaymentsWithoutExternalDBId(connMysql, (errors, payments) => {
        callback(errors, payments);
    });
}

function runJob() {
    let serverNames = [constants.SERVIDOR_A, constants.SERVIDOR_B, constants.SERVIDOR_C];
    /*
    * This guy transfers orders that are not supposed to be in the server in question, it moves orders to the correct server
    * */
    serverNames.forEach(originServer => {
        getInaccurateDataFromServer(originServer, orders => {
            console.log("Working with server ", originServer);
            const mysqlOriginConn = getMysqlConnection(originServer);
            if (typeof orders === Object.name.toLowerCase() && orders.length) {
                console.log("Going to transfer orders from server " + originServer);
                transferOrderToAnotherServer(mysqlOriginConn, originServer, orders, (errors, isOk, message) => {
                    console.log(errors, isOk, message);
                });
            } else {
                console.log("Nothing to fix in server ", originServer);
            }
        });
    });

    /*
    * This guys will copy orders that didn't make it to Firestore and got stored in the local database only and then update
    * the generated firestore id into the recrods affected
    * */
    serverNames.forEach(originServer => {
        getDataWithoutExternalDBId(originServer, (errors, orders) => {
            if (!errors) {
                transferOrdersToExternalDB(connFb, orders, originServer);
            } else {
                console.log(errors);
            }
        });
    });

    serverNames.forEach(originServer => {
        getPaymentDataWithoutExternalDBId(originServer, (errors, payments) => {
            if (!errors) {
                transferPaymentsToExternalDB(connFb, payments, originServer)
            } else {
                console.log(errors);
            }
        });
    });
}

function runInterval(minutes) {
    console.log("Running sync job");
    const the_interval = minutes * 60 * 1000;
    setInterval(runJob, the_interval);
}

yargs.version('1.1.0')

// Create add command
yargs.command({
    command: 'run',
    describe: 'Starts a job that will run every X minutes set by the user',
    builder: {
        minutes: {
            describe: 'Minutes that will happen between each cycle',
            demandOption: true,  // Required
            type: 'number'
        }
    },

    // Function for your command
    handler(argv) {
        const the_interval = argv.minutes * 60 * 1000;
        setInterval(runJob, the_interval);
    }
}).command({
    command: 'run-now',
    describe: 'Runs the process right away',

    // Function for your command
    handler(argv) {
        runJob();
    }
})

yargs.parse() // To set above changes