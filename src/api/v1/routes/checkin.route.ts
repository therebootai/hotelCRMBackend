import express from "express";
import { processCheckIn } from "../controllers/checkin.controller";

const router = express.Router();

router.post("/process", processCheckIn);

export default router;