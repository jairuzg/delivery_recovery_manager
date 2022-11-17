const constants = require("./../common/moduleConstants");
const {connMysqlA, connMysqlB, connMysqlC, getMysqlConnection} = require('./mysql_connections');
const {transformQuoteToOrder} = require("../services/orders");
const {logger} = require('./../common/logger');

function getInaccurateOrdersFromMysql(conn, serverName, callback) {
    let orders = [];
    const sql = "select cotizacion_msj, st_x(recogida) recogida_longitud, st_y(recogida) recogida_latitud, st_x(destino) destino_longitud," +
        "st_y(destino) destino_latitud, fecha_servicio, estado, tiempo_estimado_llegada, fecha_llegada, bus_mensajeria, " +
        "nombre_recibe, cantidad_articulos, precio_envio, precio_articulos, precio_total, peso_total, servidor from cotizacion_msj " +
        "where servidor <> ?";
    conn.query(sql, serverName, (errors, rows, fields) => {
        if (!errors && rows.length) {
            orders = JSON.parse(JSON.stringify(rows));
            callback(orders);
        } else {
            if (errors) callback(errors.message); else callback([]);
        }
    });
}

function transferOrdersToAnotherMysqlServer(originConnMysql, serverName, orders, callback) {
    let ordersValuesArray = [];
    let ordersIdsToDelete = [];
    orders.forEach(order => {
        let orderValuesArray = [];
        Object.entries(order).forEach(([key, value]) => {
            if (key === 'cotizacion_msj') {
                ordersIdsToDelete.push(value);
            }
            orderValuesArray.push(value);
        });
        ordersValuesArray.push(orderValuesArray);
    });

    ordersValuesArray.forEach(order => {
        let destConnMysql = getMysqlConnection(order[16]);
        saveOrderInAServer(destConnMysql, order, order[16], (errors, isOk, message) => {
            if (isOk) {
                deleteOrderFromServer(originConnMysql, order[0], serverName, (errors, isOk, message) => {
                    callback(errors, isOk, message);
                });
            } else callback(errors, isOk, message);
        });
    })
}

function saveOrderInAServer(connMysql, values, serverName, callback) {
    let sql = "insert into cotizacion_msj (cotizacion_msj, recogida, destino, " +
        "fecha_servicio, estado, tiempo_estimado_llegada, fecha_llegada, bus_mensajeria, " +
        "nombre_recibe, cantidad_articulos, precio_envio, precio_articulos, precio_total, peso_total, servidor) " +
        "values (?, point(?,?), point(?,?),?,?,?,?,?,?,?,?,?,?,?,?) ";
    connMysql.query(sql, values, (errors, result) => {
        try {
            if (!errors) {
                console.log(`Inserted order ${values[0]} in server ${serverName}`);
                callback(null, true, `Inserted order ${values[0]} in server ${serverName}`);
            } else {
                console.log(`There was an error while trying to insert the order into the server ${serverName}, ${errors.sqlMessage}`);
                callback(errors, false, `There was an error while trying to insert the order into the server ${serverName}, ${errors.sqlMessage}`);
            }
        } catch (ex) {
            console.log(`There was an exception while trying to insert the order to the server ${serverName}, ${ex.message}`);
            callback(ex, false, `There was an exception while trying to insert the order to the server ${serverName}, ${ex.message}`);
        }
    });
}

function deleteOrderFromServer(connMysql, orderId, serverName, callback) {
    try {
        let sql = "delete from cotizacion_msj where cotizacion_msj = ?";
        connMysql.query(sql, orderId, (errors, result) => {
            if (!errors) {
                console.log(`Deleted order ${orderId} from server ${serverName}`);
                callback(null, true, `Deleted order ${orderId} from server ${serverName}`);
            } else {
                console.log(`There was an error while trying to delete order ${orderId} from server ${serverName}, ${errors.message}`);
                callback(errors, false, `There was an error while trying to delete order ${orderId} from server ${serverName}, ${errors.message}`);
            }
        });
    } catch (ex) {
        console.log(`There was an exception while trying to delete the order from server ${serverName}, ${ex.message}`);
        callback(ex, false, `There was an exception while trying to delete the order from server ${serverName}, ${ex.message}`);
    }
}

function fetchOrdersWithoutExternalDBId(connMysql, serverName, callback){
    let sql = "select cotizacion_msj, st_x(recogida) recogida_longitud, st_y(recogida) recogida_latitud, st_x(destino) destino_longitud," +
        "st_y(destino) destino_latitud, fecha_servicio, estado, tiempo_estimado_llegada, fecha_llegada, bus_mensajeria, " +
        "nombre_recibe, cantidad_articulos, precio_envio, precio_articulos, precio_total, peso_total, servidor, external_db_id " +
        "from cotizacion_msj where external_db_id is null";
    connMysql.query(sql, (errors, rows, fields) => {
        if(errors){
            callback(errors.sqlMessage);
        } else {
            let orders = JSON.parse(JSON.stringify(rows));
            callback(null, orders);
        }
    });
}

function updateOrderExternalDBIdByOrderId(connMysql, fbOrder, callback){
    let sql = "update cotizacion_msj set external_db_id = ? where cotizacion_msj = ?";

    connMysql.query(sql, [fbOrder.firebaseId, fbOrder.ordenID], (errors, result) => {
        if(!errors) {
            console.log(`Successfully updated order ${fbOrder.ordenID} in server ${fbOrder.servidor}` );
            callback(null, true);
        } else {
            callback(errors.message, false);
        }
    });
}

async function saveOrderInExternalDB(fbConn, fbOrder){
    let errorFb;
    await fbConn.collection("orders").add(fbOrder).then(docRef => {
        // console.log(`Successfully wrote order ${fbOrder.ordenID} into Firestore with Document ID ${docRef.id}`);
        fbOrder.firebaseId = docRef.id;
    }).catch(err => {
        errorFb = err;
        // console.log(`There was an error when trying to insert the order ${fbOrder.ordenID} in Firestore ${err.message}`);
    });
    return {errorFb, fbOrder};
}

async function deleteOrderInExternalDB(fbConn, fbOrder){
    let errorFb;
    await fbConn.collection("orders").doc(fbOrder.firebaseId).delete().then(docRef => {
        console.log(`Successfully deleted order ${fbOrder.ordenID} from Firestore with Document ID ${fbOrder.firebaseId}`);
    }).catch(err => {
        errorFb = err;
        console.log(`There was an error when trying to delete the order ${fbOrder.ordenID} in Firestore ${err.message}`);
    });
    return {errorFb, fbOrder};
}

function transferOrdersToExternalDB(connFb, orders, serverName){
    let fbOrders = [];
    orders.forEach(order => {
        fbOrders.push(transformQuoteToOrder(order));
    });
    fbOrders.forEach(fbOrder => {
        saveOrderInExternalDB(connFb, fbOrder).then(resp => {
            if (!resp.errorFb) {
                console.log(`Successfully wrote order ${fbOrder.ordenID} from server ${serverName} to Firestore with Document ID ${resp.fbOrder.firebaseId}`);
                const connMysql = getMysqlConnection(serverName);
                updateOrderExternalDBIdByOrderId(connMysql, resp.fbOrder, (errors, isOk) => {
                    if(!errors && isOk){
                        console.log(`Successfully synchronized order ${fbOrder.ordenID} from server ${serverName} with Firebase`);
                    } else {
                        deleteOrderInExternalDB(connFb, resp.fbOrder).then(resp=>{
                            if (resp.errorFb){
                                console.log(`Error while trying to delete the order ${fbOrder.ordenID}, writing logs to manually fix it`);
                                logger.error({from: serverName, to: 'externalDB', data: fbOrder});
                            }
                        });
                    }
                });

            } else {
                console.log(`There was an error when trying to insert the order ${fbOrder.ordenID} from server ${serverName} in Firestore ${resp.errorFb.message}`);
            }
        })
    });
}

module.exports = {
    getInaccurateOrdersFromMysql: getInaccurateOrdersFromMysql,
    transferOrderToAnotherServer: transferOrdersToAnotherMysqlServer,
    fetchOrdersWithoutExternalDBId: fetchOrdersWithoutExternalDBId,
    transferOrdersToExternalDB: transferOrdersToExternalDB
};