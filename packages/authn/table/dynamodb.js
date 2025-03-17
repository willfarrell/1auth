export default (table = "authentications", { timeToLiveKey } = {}) => {
  timeToLiveKey ??= "remove";
  return {
    TableName: table,
    AttributeDefinitions: [
      {
        AttributeName: "id",
        AttributeType: "S",
      },
      {
        AttributeName: "sub",
        AttributeType: "S",
      },
      {
        AttributeName: "type",
        AttributeType: "S",
      },
      {
        AttributeName: "expire",
        AttributeType: "N",
      },
    ],
    KeySchema: [
      {
        AttributeName: "sub",
        KeyType: "HASH",
      },
      {
        AttributeName: "id",
        KeyType: "RANGE",
      },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: "sub",
        KeySchema: [
          {
            AttributeName: "sub",
            KeyType: "HASH",
          },
        ],
        Projection: {
          ProjectionType: "INCLUDE",
          NonKeyAttributes: [
            "encryptionKey",
            "value",
            "name",
            "create",
            "verify",
            "expire",
            "lastused",
          ],
        },
      },
      {
        IndexName: "expire",
        KeySchema: [
          {
            AttributeName: "type",
            KeyType: "HASH",
          },
          {
            AttributeName: "expire",
            KeyType: "RANGE",
          },
        ],
        Projection: {
          ProjectionType: "INCLUDE",
          NonKeyAttributes: ["sub"],
        },
      },
    ],
    TimeToLiveSpecification: {
      Enabled: true,
      AttributeName: timeToLiveKey,
    },
    BillingMode: "PAY_PER_REQUEST",
  };
};
