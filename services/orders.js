const constants = require('./../common/moduleConstants');
const {getMysqlConnection} = require("../db/mysql_connections");
const {logger} = require("../common/logger");

function transformQuoteToOrder(orden) {
    return {
        "ordenID": orden['cotizacion_msj'],
        "estado": (orden['estado'] && orden['estado'] !== "") ? orden['estado'] : constants.ORDEN_NUEVA,
        "cantidadArticulos": orden['cantidad_articulos'],
        "fechaEntrega": orden['fecha_Entrega'] ? orden['fecha_entrega'] : null,
        "ETA": orden['tiempo_estimado_llegada'],
        "costoEnvio": orden['precio_total'] * constants.PERCENT_TAX,
        "costoPiezas": orden['precio_total'],
        "costoTotal": (orden['precio_total'] + (orden['precio_total'] * constants.PERCENT_TAX)),
        "servidor": orden['servidor']
    }
}

module.exports = {
    transformQuoteToOrder: transformQuoteToOrder
};