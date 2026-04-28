const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    collaborators: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["editor", "viewer"],
          default: "viewer",
        },
      },
    ],
    content: {
      type: Buffer,
      default: () => Buffer.alloc(0),
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

documentSchema.pre("save", function updateTimestamp(next) {
  this.updatedAt = new Date();
  next();
});

documentSchema.index({ owner: 1, updatedAt: -1 });
documentSchema.index({ "collaborators.user": 1, updatedAt: -1 });

module.exports = mongoose.model("Document", documentSchema);
