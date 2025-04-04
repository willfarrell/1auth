export default (table = "sessions", { timeToLiveKey } = {}) => {
  timeToLiveKey ??= "remove";
  return {
    TableName: table,
    AttributeDefinitions: [
      {
        AttributeName: "sub",
        AttributeType: "S",
      },
      {
        AttributeName: "id",
        AttributeType: "S",
      },
      {
        AttributeName: "digest",
        AttributeType: "S",
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
            "metadata", // optional, used in tests
            "create",
            "expire",
          ],
        },
      },
      {
        IndexName: "digest",
        KeySchema: [
          {
            AttributeName: "digest",
            KeyType: "HASH",
          },
        ],
        Projection: {
          ProjectionType: "INCLUDE",
          NonKeyAttributes: [
            "sub",
            "encryptionKey",
            "value",
            "create",
            "expire",
          ],
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
