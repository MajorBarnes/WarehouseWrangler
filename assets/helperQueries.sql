SELECT 
    c.carton_number,
    p.artikel,
    cc.boxes_initial,
    cc.boxes_current,
    cc.boxes_sent_to_amazon
FROM carton_contents cc
JOIN cartons c ON cc.carton_id = c.carton_id
JOIN products p ON cc.product_id = p.product_id
ORDER BY c.created_at DESC
LIMIT 100

DELETE FROM `carton_contents` WHERE `carton_contents`.`boxes_sent_to_amazon` = 0

DELETE FROM `cartons` WHERE `cartons`.`status` = "in stock"